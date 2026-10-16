"use client";

import { useEffect, useState } from "react";
import { activeToken, alignWords, displayTokens, LAUGH } from "@/lib/align";
import { cn } from "@/lib/utils";
import type { Line } from "@/lib/story";
import type { Timeline } from "@/lib/narrate";

type Position = { line: number; token: number };

export function useReadAlong(ctx: AudioContext | null, timeline: Timeline | null, lines: Line[]): Position | null {
  const [pos, setPos] = useState<Position | null>(null);
  useEffect(() => {
    if (!ctx || !timeline) {
      setPos(null);
      return;
    }
    const tokens = lines.map((l) => displayTokens(l.text));
    let raf = 0;
    let last = "";
    const tick = () => {
      const now = ctx.currentTime;
      let line = -1;
      timeline.lineStarts.forEach((start, i) => {
        if (start !== undefined && start <= now) line = i;
      });
      let token = -1;
      if (line >= 0) {
        const words = timeline.words[line] ?? [];
        token = activeToken(
          words.map((w) => w.start),
          alignWords(tokens[line]!, words.map((w) => w.word)),
          now - timeline.lineStarts[line]!,
        );
      }
      const key = `${line}:${token}`;
      if (key !== last) {
        last = key;
        setPos({ line, token });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ctx, timeline, lines]);
  return pos;
}

export function ReadAlongLine({
  line,
  speaker,
  state,
  token,
}: {
  line: Line;
  speaker: string;
  state: "before" | "active" | "after";
  token: number;
}) {
  const tokens = displayTokens(line.text);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs leading-4 text-muted-foreground">{speaker}</span>
      <p className={cn("text-2xl leading-9 text-pretty transition-colors", state === "before" && "text-muted-foreground/70")}>
        {tokens.map((t, i) => {
          const spoken = state === "after" || (state === "active" && i < token);
          const current = state === "active" && i === token;
          return (
            <span key={i}>
              {t === LAUGH ? (
                <span className="text-muted-foreground italic">(laughs)</span>
              ) : (
                <span
                  className={cn(
                    "-mx-0.5 rounded-md px-0.5 transition-colors duration-100",
                    current && "bg-accent text-accent-foreground",
                    state === "active" && !spoken && !current && "text-muted-foreground",
                  )}
                >
                  {t}
                </span>
              )}
              {i < tokens.length - 1 ? " " : null}
            </span>
          );
        })}
      </p>
    </div>
  );
}
