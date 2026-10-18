"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startInterpreter, StartError, type Phase, type Turn } from "./interpreter";
import type { Lang } from "./languages";
import { createSessionGate } from "./session-gate";

type Session = Awaited<ReturnType<typeof startInterpreter>>;

export function useInterpreter() {
  const [gate] = useState(() => createSessionGate<Session>());
  const attempt = useRef(0);
  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    attempt.current++;
    setLive(false);
    setPhase(null);
    setCaption("");
    await gate.stop();
  }, [gate]);

  const start = useCallback(
    async (pair: readonly [Lang, Lang]) => {
      if (gate.busy) return;
      const id = ++attempt.current;
      const current = () => id === attempt.current;
      setError(null);
      setTurns([]);
      setLive(true);
      try {
        await gate.start(() =>
          startInterpreter(pair, {
            onTurns: (t) => current() && setTurns(t),
            onCaption: (c) => current() && setCaption(c),
            onPhase: (p) => current() && setPhase(p),
            onError: (message) => {
              if (!current()) return;
              setError(message);
              void stop();
            },
          }),
        );
      } catch (err) {
        if (!current()) return;
        setLive(false);
        setPhase(null);
        setError(err instanceof StartError ? err.message : "Could not start. Check the console for details.");
        console.error(err);
      }
    },
    [gate, stop],
  );

  useEffect(() => () => void gate.stop(), [gate]);

  return { live, phase, turns, caption, error, start, stop };
}
