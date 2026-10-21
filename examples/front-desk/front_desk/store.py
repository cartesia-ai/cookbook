from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SCHEMA = """
create table if not exists calls (
  id text primary key,
  agent_id text not null default '',
  status text not null default 'started',
  connection text not null default '',
  caller text not null default '',
  start_time text,
  end_time text,
  end_reason text,
  summary text,
  updated_at text not null
);
create table if not exists turns (
  call_id text not null,
  idx integer not null,
  role text not null,
  text text not null default '',
  start_ts real,
  end_ts real,
  stt_ttfb real,
  tts_ttfb real,
  interrupted integer not null default 0,
  tool_calls text not null default '[]',
  metric text not null default '',
  primary key (call_id, idx)
);
create table if not exists appointments (
  id integer primary key autoincrement,
  call_id text not null default '',
  start_at text not null,
  end_at text not null,
  name text not null,
  phone text not null default '',
  service text not null default '',
  calendar text not null default 'local',
  external_id text not null default '',
  created_at text not null
);
create unique index if not exists appointments_local_slot on appointments (start_at) where calendar = 'local';
create table if not exists messages (
  id integer primary key autoincrement,
  call_id text not null default '',
  name text not null,
  phone text not null default '',
  body text not null,
  urgent integer not null default 0,
  created_at text not null
);
create table if not exists handoffs (
  id integer primary key autoincrement,
  call_id text not null default '',
  reason text not null,
  name text not null default '',
  transferred integer not null default 0,
  created_at text not null
);
create table if not exists webhook_events (
  request_id text primary key,
  received_at text not null
);
"""


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Path):
        self.path = path
        if not path.parent.exists():
            path.parent.mkdir(parents=True, mode=0o700)
            path.parent.chmod(0o700)
        # Calls, transcripts and caller numbers live here: owner-only before SQLite writes anything.
        os.close(os.open(path, os.O_CREAT | os.O_WRONLY, 0o600))
        path.chmod(0o600)
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def first_delivery(self, request_id: str) -> bool:
        with self._conn() as c:
            cur = c.execute(
                "insert or ignore into webhook_events (request_id, received_at) values (?, ?)",
                (request_id, now_iso()),
            )
            return cur.rowcount == 1

    def forget_delivery(self, request_id: str) -> None:
        with self._conn() as c:
            c.execute("delete from webhook_events where request_id = ?", (request_id,))

    def upsert_call(self, call: dict[str, Any]) -> None:
        tp = call.get("telephony_params") or {}
        connection = tp.get("connection_type") or ""
        caller = ""
        if connection == "phone":
            direction = tp.get("direction") or "inbound"
            caller = (tp.get("from") if direction == "inbound" else tp.get("to")) or ""
        fields = {
            "agent_id": call.get("agent_id"),
            "status": call.get("status"),
            "connection": connection or None,
            "caller": caller or None,
            "start_time": call.get("start_time"),
            "end_time": call.get("end_time"),
            "end_reason": call.get("end_reason"),
            "summary": call.get("summary"),
        }
        with self._conn() as c:
            c.execute("insert or ignore into calls (id, updated_at) values (?, ?)", (call["id"], now_iso()))
            sets = [
                f"{k} = case when {k} in ('completed', 'failed') then {k} else coalesce(?, {k}) end"
                if k == "status"
                else f"{k} = coalesce(?, {k})"
                for k in fields
            ]
            c.execute(
                f"update calls set {', '.join(sets)}, updated_at = ? where id = ?",  # noqa: S608
                (*fields.values(), now_iso(), call["id"]),
            )
        transcript = call.get("transcript")
        if isinstance(transcript, list) and transcript:
            self.replace_turns(call["id"], transcript)

    def set_summary(self, call_id: str, summary: str) -> None:
        with self._conn() as c:
            c.execute("insert or ignore into calls (id, updated_at) values (?, ?)", (call_id, now_iso()))
            c.execute(
                "update calls set summary = ?, updated_at = ? where id = ?", (summary, now_iso(), call_id)
            )

    def replace_turns(self, call_id: str, transcript: list[dict[str, Any]]) -> None:
        with self._conn() as c:
            c.execute("delete from turns where call_id = ?", (call_id,))
            for i, t in enumerate(transcript):
                c.execute(
                    "insert into turns values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    _turn_row(call_id, i, t),
                )

    def upsert_turn(self, call_id: str, turn: dict[str, Any]) -> None:
        idx = turn.get("id")
        if not isinstance(idx, int):
            with self._conn() as c:
                row = c.execute("select count(*) from turns where call_id = ?", (call_id,)).fetchone()
                idx = int(row[0])
        with self._conn() as c:
            c.execute("insert or ignore into calls (id, updated_at) values (?, ?)", (call_id, now_iso()))
            c.execute(
                "insert or replace into turns values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                _turn_row(call_id, idx, turn),
            )

    def list_calls(self, limit: int = 100) -> list[CallRow]:
        with self._conn() as c:
            rows = c.execute(
                "select * from calls order by coalesce(start_time, updated_at) desc limit ?", (limit,)
            ).fetchall()
            out = []
            for r in rows:
                turns = self._turns(c, r["id"])
                out.append(CallRow.from_row(r, turns, self._side_effects(c, r["id"])))
            return out

    def get_call(self, call_id: str) -> CallRow | None:
        with self._conn() as c:
            r = c.execute("select * from calls where id = ?", (call_id,)).fetchone()
            if r is None:
                return None
            return CallRow.from_row(r, self._turns(c, call_id), self._side_effects(c, call_id))

    def _turns(self, c: sqlite3.Connection, call_id: str) -> list[TurnRow]:
        rows = c.execute("select * from turns where call_id = ? order by idx", (call_id,)).fetchall()
        return [TurnRow.from_row(r) for r in rows]

    def _side_effects(self, c: sqlite3.Connection, call_id: str) -> dict[str, int]:
        out = {}
        for table in ("appointments", "messages", "handoffs"):
            out[table] = int(
                c.execute(f"select count(*) from {table} where call_id = ?", (call_id,)).fetchone()[0]  # noqa: S608
            )
        return out

    def add_appointment(
        self,
        *,
        call_id: str,
        start_at: str,
        end_at: str,
        name: str,
        phone: str,
        service: str,
        calendar: str,
        external_id: str = "",
    ) -> bool:
        try:
            with self._conn() as c:
                c.execute(
                    "insert into appointments (call_id, start_at, end_at, name, phone, service, calendar,"
                    " external_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (call_id, start_at, end_at, name, phone, service, calendar, external_id, now_iso()),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def booked_starts(self, start_at: str, end_at: str) -> set[str]:
        with self._conn() as c:
            rows = c.execute(
                "select start_at from appointments where calendar = 'local' and start_at >= ? and start_at < ?",
                (start_at, end_at),
            ).fetchall()
            return {r[0] for r in rows}

    def list_appointments(self) -> list[dict[str, Any]]:
        with self._conn() as c:
            return [dict(r) for r in c.execute("select * from appointments order by start_at").fetchall()]

    def add_message(self, *, call_id: str, name: str, phone: str, body: str, urgent: bool) -> int:
        with self._conn() as c:
            cur = c.execute(
                "insert into messages (call_id, name, phone, body, urgent, created_at) values (?, ?, ?, ?, ?, ?)",
                (call_id, name, phone, body, int(urgent), now_iso()),
            )
            return int(cur.lastrowid or 0)

    def list_messages(self) -> list[dict[str, Any]]:
        with self._conn() as c:
            return [dict(r) for r in c.execute("select * from messages order by created_at desc").fetchall()]

    def add_handoff(self, *, call_id: str, reason: str, name: str, transferred: bool) -> None:
        with self._conn() as c:
            c.execute(
                "insert into handoffs (call_id, reason, name, transferred, created_at) values (?, ?, ?, ?, ?)",
                (call_id, reason, name, int(transferred), now_iso()),
            )


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


def _turn_row(call_id: str, idx: int, t: dict[str, Any]) -> tuple[Any, ...]:
    return (
        call_id,
        idx,
        str(t.get("role") or ""),
        str(t.get("text") or ""),
        _num(t.get("start_timestamp")),
        _num(t.get("end_timestamp")),
        _num(t.get("stt_ttfb")),
        _num(t.get("tts_ttfb")),
        int(bool(t.get("was_interrupted"))),
        json.dumps(t.get("tool_calls") or []),
        json.dumps(t["log_metric"]) if isinstance(t.get("log_metric"), dict) else "",
    )


@dataclass
class TurnRow:
    idx: int
    role: str
    text: str
    start_ts: float | None
    end_ts: float | None
    stt_ttfb: float | None
    tts_ttfb: float | None
    interrupted: bool
    tool_calls: list[dict[str, Any]]
    metric: dict[str, Any]

    @classmethod
    def from_row(cls, r: sqlite3.Row) -> TurnRow:
        try:
            tools = json.loads(r["tool_calls"])
        except ValueError:
            tools = []
        try:
            metric = json.loads(r["metric"]) if r["metric"] else {}
        except ValueError:
            metric = {}
        return cls(
            idx=r["idx"],
            role=r["role"],
            text=r["text"],
            start_ts=r["start_ts"],
            end_ts=r["end_ts"],
            stt_ttfb=r["stt_ttfb"],
            tts_ttfb=r["tts_ttfb"],
            interrupted=bool(r["interrupted"]),
            tool_calls=tools if isinstance(tools, list) else [],
            metric=metric if isinstance(metric, dict) else {},
        )


@dataclass
class CallRow:
    id: str
    status: str
    connection: str
    caller: str
    start_time: str | None
    end_time: str | None
    end_reason: str | None
    summary: str | None
    turns: list[TurnRow]
    side_effects: dict[str, int]

    @classmethod
    def from_row(cls, r: sqlite3.Row, turns: list[TurnRow], side: dict[str, int]) -> CallRow:
        return cls(
            id=r["id"],
            status=r["status"],
            connection=r["connection"],
            caller=r["caller"],
            start_time=r["start_time"],
            end_time=r["end_time"],
            end_reason=r["end_reason"],
            summary=r["summary"],
            turns=turns,
            side_effects=side,
        )

    @property
    def visible_turns(self) -> list[TurnRow]:
        shown = [t for t in self.turns if t.role != "system" and (t.text or t.tool_calls)]
        return sorted(shown, key=lambda t: (t.start_ts if t.start_ts is not None else 0.0, t.idx))

    def metric_values(self, name: str) -> list[float]:
        out = []
        for t in self.turns:
            v = t.metric.get("value")
            if t.metric.get("name") == name and isinstance(v, int | float):
                out.append(float(v) / 1000)
        return out

    @property
    def tool_names(self) -> set[str]:
        return {str(tc.get("name")) for t in self.turns for tc in t.tool_calls if isinstance(tc, dict)}

    @property
    def outcome(self) -> str:
        names = self.tool_names
        if self.side_effects.get("appointments") or _succeeded(self.turns, "book_appointment"):
            return "Booked"
        if self.side_effects.get("handoffs") or "transfer_call" in names or "transfer_to_number" in names:
            return "Transferred"
        if self.side_effects.get("messages") or "take_message" in names:
            return "Message"
        return "Info"

    @property
    def duration_secs(self) -> float | None:
        if self.start_time and self.end_time:
            try:
                a = datetime.fromisoformat(self.start_time.replace("Z", "+00:00"))
                b = datetime.fromisoformat(self.end_time.replace("Z", "+00:00"))
                return max(0.0, (b - a).total_seconds())
            except ValueError:
                pass
        ends = [t.end_ts for t in self.turns if t.end_ts is not None]
        return max(ends) if ends else None


def _succeeded(turns: list[TurnRow], name: str) -> bool:
    for t in turns:
        for tc in t.tool_calls:
            if isinstance(tc, dict) and tc.get("name") == name:
                result = str(tc.get("result") or "")
                if '"booked": true' in result or '"booked":true' in result:
                    return True
    return False
