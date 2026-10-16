"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startInterpreter, StartError, type Phase, type Turn } from "./interpreter";
import type { Lang } from "./languages";

type Session = Awaited<ReturnType<typeof startInterpreter>>;

export function useInterpreter() {
  const session = useRef<Session | null>(null);
  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    const s = session.current;
    session.current = null;
    setLive(false);
    setPhase(null);
    setCaption("");
    await s?.stop();
  }, []);

  const start = useCallback(
    async (pair: readonly [Lang, Lang]) => {
      if (session.current) return;
      setError(null);
      setTurns([]);
      setLive(true);
      try {
        session.current = await startInterpreter(pair, {
          onTurns: setTurns,
          onCaption: setCaption,
          onPhase: setPhase,
          onError: (message) => {
            setError(message);
            void stop();
          },
        });
      } catch (err) {
        setLive(false);
        setPhase(null);
        setError(err instanceof StartError ? err.message : "Could not start. Check the console for details.");
        console.error(err);
      }
    },
    [stop],
  );

  useEffect(() => () => void session.current?.stop(), []);

  return { live, phase, turns, caption, error, start, stop };
}
