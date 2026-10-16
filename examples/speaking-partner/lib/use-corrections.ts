"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMessage } from "@/lib/agents-web/react";
import type { Correction } from "./corrections";
import { requestCorrection, ApiError } from "./client-api";
import type { LanguageCode } from "./languages";

export const MAX_CHECKS = 40;

export type CorrectionItem =
  | { turn: number; text: string; status: "pending" }
  | { turn: number; text: string; status: "done"; correction: Correction }
  | { turn: number; text: string; status: "error"; reason: "no_key" | "failed" };

interface Options {
  messages: AgentMessage[];
  enabled: boolean;
  target: LanguageCode;
  native: LanguageCode;
  mission: string;
}

export function useCorrections({ messages, enabled, target, native, mission }: Options) {
  const [items, setItems] = useState<CorrectionItem[]>([]);
  const seen = useRef(new Set<number>());
  const queue = useRef<{ turn: number; text: string }[]>([]);
  const running = useRef(false);
  const recent = useRef<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const cfg = useRef({ target, native, mission });
  cfg.current = { target, native, mission };

  const patch = useCallback((turn: number, next: CorrectionItem) => {
    setItems((prev) => prev.map((i) => (i.turn === turn ? next : i)));
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length > 0) {
        const job = queue.current.shift()!;
        const ctl = new AbortController();
        abort.current = ctl;
        try {
          const correction = await requestCorrection(
            { text: job.text, ...cfg.current, recent: recent.current.slice(-3) },
            ctl.signal,
          );
          patch(job.turn, { turn: job.turn, text: job.text, status: "done", correction });
        } catch (err) {
          if (ctl.signal.aborted) return;
          const noKey = err instanceof ApiError && err.status === 503;
          patch(job.turn, { turn: job.turn, text: job.text, status: "error", reason: noKey ? "no_key" : "failed" });
        }
        recent.current.push(job.text);
      }
    } finally {
      running.current = false;
    }
  }, [patch]);

  useEffect(() => {
    if (!enabled) return;
    const fresh = messages.filter((m) => m.role === "user" && m.final && m.text.trim() && !seen.current.has(m.turn));
    if (fresh.length === 0) return;
    const adds: CorrectionItem[] = [];
    for (const m of fresh) {
      seen.current.add(m.turn);
      if (seen.current.size > MAX_CHECKS) continue;
      adds.push({ turn: m.turn, text: m.text.trim(), status: "pending" });
      queue.current.push({ turn: m.turn, text: m.text.trim() });
    }
    if (adds.length === 0) return;
    setItems((prev) => [...prev, ...adds]);
    void pump();
  }, [messages, enabled, pump]);

  useEffect(() => () => abort.current?.abort(), []);

  const itemsRef = useRef<CorrectionItem[]>([]);
  itemsRef.current = items;

  const retry = useCallback(
    (turn: number) => {
      const item = itemsRef.current.find((i) => i.turn === turn);
      if (!item || item.status !== "error") return;
      queue.current.push({ turn, text: item.text });
      patch(turn, { turn, text: item.text, status: "pending" });
      void pump();
    },
    [patch, pump],
  );

  return { items, retry };
}
