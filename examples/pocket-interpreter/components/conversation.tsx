"use client";

import { useEffect, useRef } from "react";
import { ALargeSmall, FlipHorizontal2, Loader2, Mic } from "lucide-react";
import { EmptyState } from "@/components/blocks/empty-state";
import { Button } from "@/components/ui/button";
import type { Phase, Turn } from "@/lib/interpreter";
import { COPY, englishName, hintFor, nativeName, type Lang } from "@/lib/languages";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<Phase, string> = {
  connecting: "Connecting",
  listening: "Listening",
  hearing: "Hearing",
  translating: "Translating",
  speaking: "Speaking",
};

function seconds(ms: number | undefined) {
  return ms === undefined ? "..." : `${(ms / 1000).toFixed(2)} s`;
}

function Latency({ turn }: { turn: Turn }) {
  if (turn.status === "failed") return null;
  return (
    <p
      className="px-1 text-xs tabular-nums text-muted-foreground/80"
      title="Time from the end of the turn to the first translated word, then to the first audio"
    >
      heard → translated {seconds(turn.latency.translatedMs)} → speaking {seconds(turn.latency.speakingMs)}
    </p>
  );
}

function Bubble({ turn, lang, large }: { turn: Turn; lang: Lang; large: boolean }) {
  const own = turn.from === lang;
  const text = own ? turn.source : turn.translation;
  const size = large ? "text-lg leading-7" : "text-sm leading-6";
  if (own) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className={cn("max-w-[85%] rounded-xl bg-secondary text-secondary-foreground px-3 py-2 text-pretty", size)} lang={lang}>
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={cn("max-w-[85%] rounded-xl border border-border bg-background px-3 py-2 text-pretty", size)}
        lang={lang}
        aria-live="polite"
      >
        {turn.status === "failed" && !text ? (
          <span className="text-destructive">Could not translate this turn.</span>
        ) : text ? (
          text
        ) : (
          <Loader2 aria-label={COPY[lang].translating} className="my-1 size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="max-w-[85%] px-1 text-xs leading-4 text-muted-foreground" lang={turn.from ?? undefined}>
        {turn.source}
      </p>
      <Latency turn={turn} />
    </div>
  );
}

function SidePanel({
  lang,
  other,
  turns,
  phase,
  flipped,
  large,
  className,
}: {
  lang: Lang;
  other: Lang;
  turns: Turn[];
  phase: Phase | null;
  flipped: boolean;
  large: boolean;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const mine = turns.filter((t) => t.from !== null);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const status =
    phase === "speaking" ? COPY[lang].speaking : phase === "translating" ? COPY[lang].translating : COPY[lang].listening;

  return (
    <section
      aria-label={`${englishName(lang)} side`}
      lang={lang}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-transform duration-300 motion-reduce:transition-none",
        flipped && "rotate-180",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <h2 className="text-sm font-medium">{nativeName(lang)}</h2>
        {phase && phase !== "connecting" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full bg-primary", phase !== "listening" && "animate-pulse")}
            />
            {status}
          </span>
        ) : null}
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      >
        {mine.length === 0 ? (
          <EmptyState
            className="my-auto border-0 py-6"
            icon={<Mic />}
            title={COPY[lang].empty}
            description={hintFor(lang, other)}
          />
        ) : (
          mine.map((t) => <Bubble key={t.id} turn={t} lang={lang} large={large} />)
        )}
      </div>
    </section>
  );
}

export function Conversation({
  pair,
  turns,
  phase,
  caption,
  flipped,
  onFlip,
  large,
  onLarge,
  onEnd,
}: {
  pair: [Lang, Lang];
  turns: Turn[];
  phase: Phase | null;
  caption: string;
  flipped: boolean;
  onFlip: () => void;
  large: boolean;
  onLarge: () => void;
  onEnd: () => void;
}) {
  const [a, b] = pair;
  const pending = turns.find((t) => t.from === null)?.source;
  const line = caption || pending || "";
  const label = phase ? PHASE_LABEL[phase] : "Ready";
  const live = phase !== null && phase !== "connecting";

  return (
    <div className="mx-auto grid h-[calc(100dvh-3.5rem)] w-full max-w-5xl grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 px-4 py-3 sm:px-6 sm:py-4 md:grid-cols-2 md:grid-rows-[auto_minmax(0,1fr)] md:gap-4">
      <SidePanel lang={b} other={a} turns={turns} phase={phase} flipped={flipped} large={large} className="md:order-3" />

      <div className="flex min-w-0 items-center gap-2 md:order-1 md:col-span-2" role="toolbar" aria-label="Conversation">
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
            live ? "border-primary/30 bg-accent text-accent-foreground" : "border-border bg-background text-muted-foreground",
          )}
        >
          {phase === "connecting" ? (
            <Loader2 aria-hidden className="size-3 animate-spin" />
          ) : (
            <span aria-hidden className={cn("size-1.5 rounded-full bg-primary", phase !== "listening" && "animate-pulse")} />
          )}
          {label}
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground" aria-live="off">
          {line || <span className="hidden sm:inline">{`${englishName(a)} and ${englishName(b)}`}</span>}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Larger text"
          aria-pressed={large}
          className={cn(large && "bg-accent text-accent-foreground")}
          onClick={onLarge}
        >
          <ALargeSmall />
        </Button>
        <Button variant="outline" size="sm" aria-pressed={flipped} aria-label="Flip their side" onClick={onFlip}>
          <FlipHorizontal2 /> <span className="hidden sm:inline">Flip</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/40 dark:bg-destructive/15"
          onClick={onEnd}
        >
          End
        </Button>
      </div>

      <SidePanel lang={a} other={b} turns={turns} phase={phase} flipped={false} large={large} className="md:order-2" />
    </div>
  );
}
