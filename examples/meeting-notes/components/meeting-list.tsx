"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Mic, Search } from "lucide-react";
import { EmptyState } from "@/components/blocks/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/status-chips";
import { formatDate, formatDuration } from "@/lib/format";
import { effectiveMeeting } from "@/lib/pipeline";
import { useMeetings } from "@/lib/store";
import type { Meeting } from "@/lib/schema";

function matches(m: Meeting, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [m.title, m.summary, m.transcript].some((t) => t?.toLowerCase().includes(needle));
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const m = effectiveMeeting(meeting);
  const open = m.actionItems.filter((a) => !a.done).length;
  const meta = [
    formatDate(m.createdAt),
    m.durationSec ? formatDuration(m.durationSec) : null,
    m.status === "ready" && m.decisions.length > 0 ? plural(m.decisions.length, "decision") : null,
    open > 0 ? `${open} open` : null,
  ].filter(Boolean);

  return (
    <li>
      <Link
        href={`/meeting/${m.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 sm:px-5"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium">{m.title}</span>
          <span className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>
        </div>
        {m.status !== "ready" && <StatusChip status={m.status} />}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function MeetingList() {
  const meetings = useMeetings();
  const [query, setQuery] = useState("");
  const shown = meetings?.filter((m) => matches(m, query)) ?? [];

  return (
    <section aria-labelledby="meetings-heading" className="mt-10 flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="meetings-heading" className="text-sm font-medium">
          Meetings
        </h2>
        {meetings && meetings.length > 0 && (
          <div className="relative sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings"
              aria-label="Search meetings"
              className="pl-9"
            />
          </div>
        )}
      </div>

      {!meetings ? (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {[0, 1].map((i) => (
            <div key={i} className="flex h-16 flex-col justify-center gap-2 px-4 sm:px-5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState icon={<Mic />} title="No meetings yet" description="Record or upload one above. Notes stay in this browser." />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Search />} title="No matches" description={`Nothing matches "${query.trim()}".`} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {shown.map((m) => (
            <MeetingRow key={m.id} meeting={m} />
          ))}
        </ul>
      )}
    </section>
  );
}
