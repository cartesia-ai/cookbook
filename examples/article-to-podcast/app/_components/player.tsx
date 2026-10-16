"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { activeLineIndex } from "../../lib/wav";
import type { ScriptLine } from "../../lib/types";

type Props = {
  title: string;
  note?: string | null;
  lines: ScriptLine[];
  names: { A: string; B: string };
  audioUrl: string | null;
  starts: number[] | null;
  fileName: string;
};

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Player({ title, note, lines, names, audioUrl, starts, fileName }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setActive(-1);
    setPlaying(false);
    setTime(0);
    setDuration(0);
  }, [audioUrl]);

  useEffect(() => {
    if (active < 0) return;
    const list = listRef.current;
    const row = list?.children[active] as HTMLElement | undefined;
    if (!list || !row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - 8, behavior: reduce ? "auto" : "smooth" });
    }
  }, [active]);

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setTime(audio.currentTime);
    if (!starts) return;
    const next = activeLineIndex(starts, audio.currentTime);
    setActive((prev) => (prev === next ? prev : next));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function seekTo(t: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = t;
    setTime(t);
  }

  function seek(i: number) {
    const audio = audioRef.current;
    if (!audio || !starts) return;
    audio.currentTime = starts[i];
    void audio.play();
  }

  const ready = Boolean(audioUrl);
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium leading-5 text-pretty">{title}</p>
            <p className="text-xs leading-4 text-muted-foreground">
              {names.A} and {names.B}, {lines.length} lines
            </p>
            {note ? <p className="text-xs leading-4 text-muted-foreground">{note}</p> : null}
          </div>
          {audioUrl ? (
            <a href={audioUrl} download={fileName} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
              <Download aria-hidden /> Download
            </a>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="rounded-full"
            disabled={!ready}
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
          >
            {playing ? <Pause className="fill-current" /> : <Play className="translate-x-px fill-current" />}
          </Button>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{clock(time)}</span>
          <div className="relative flex h-5 flex-1 items-center">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              disabled={!ready}
              aria-label="Seek"
              aria-valuetext={`${clock(time)} of ${clock(duration)}`}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full border-2 border-primary bg-background peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:hidden"
              style={{ left: `${progress}%` }}
            />
          </div>
          <span className="w-9 text-xs tabular-nums text-muted-foreground">{clock(duration)}</span>
        </div>

        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        ) : null}
      </div>

      <ol ref={listRef} className="relative max-h-[32rem] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card text-card-foreground shadow-xs">
        {lines.map((line, i) => {
          const on = i === active;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!starts}
                onClick={() => seek(i)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex w-full gap-3 px-5 py-3.5 text-left outline-none transition-colors focus-visible:bg-muted sm:px-6",
                  "enabled:hover:bg-muted/60 disabled:cursor-default",
                  on && "bg-accent/60 enabled:hover:bg-accent/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    line.speaker === "A" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                    on && (line.speaker === "A" ? "bg-primary text-primary-foreground" : "bg-background"),
                  )}
                >
                  {names[line.speaker].charAt(0).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-xs font-medium leading-5", on ? "text-accent-foreground" : "text-muted-foreground")}>{names[line.speaker]}</span>
                  <span className="text-sm leading-6 text-pretty">{line.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
