"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BARS = 32;

export function LevelMeter({
  stream,
  audioContext,
  className,
}: {
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  className?: string;
}) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!stream || !audioContext) return;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const history = new Array<number>(BARS).fill(0);
    let frame = 0;
    let last = 0;

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      if (t - last < 60) return;
      last = t;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      history.shift();
      history.push(Math.min(1, rms * 4));
      history.forEach((level, i) => {
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.15, level)})`;
      });
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
    };
  }, [stream, audioContext]);

  return (
    <div className={cn("flex h-6 items-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className="h-full w-[3px] origin-center scale-y-[0.15] rounded-full bg-destructive/70 transition-transform duration-75"
        />
      ))}
    </div>
  );
}
