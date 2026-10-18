"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ApiError, createSession, endSession } from "@/lib/client-api";
import type { LanguageCode } from "@/lib/languages";
import type { Mission } from "@/lib/missions";
import type { Mode } from "@/lib/modes";
import { MissionPicker } from "./mission-picker";
import { SessionView, type SessionResult } from "./session-view";
import { Shell } from "./shell";
import { Splash } from "./splash";
import { Summary } from "./summary";

type Phase =
  | { name: "splash" }
  | { name: "missions" }
  | { name: "preparing"; mission: Mission }
  | { name: "session"; mission: Mission; agentId: string }
  | { name: "summary"; mission: Mission; result: SessionResult };

export function App({ correctionsEnabled }: { correctionsEnabled: boolean }) {
  const [native, setNative] = useState<LanguageCode>("en");
  const [target, setTarget] = useState<LanguageCode>("es");
  const [mode, setMode] = useState<Mode>("teacher");
  const [phase, setPhase] = useState<Phase>({ name: "splash" });
  const [error, setError] = useState<string | null>(null);
  const agentRef = useRef<string | null>(null);
  const attempt = useRef(0);

  useEffect(() => {
    const onHide = () => {
      if (agentRef.current) endSession(agentRef.current);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const release = useCallback(() => {
    if (agentRef.current) endSession(agentRef.current);
    agentRef.current = null;
  }, []);

  const pick = useCallback(
    async (mission: Mission) => {
      const mine = ++attempt.current;
      setError(null);
      setPhase({ name: "preparing", mission });
      try {
        const agentId = await createSession({ native, target, mode, missionId: mission.id });
        if (mine !== attempt.current) return endSession(agentId);
        agentRef.current = agentId;
        setPhase({ name: "session", mission, agentId });
      } catch (err) {
        if (mine !== attempt.current) return;
        setError(err instanceof ApiError ? err.message : "Could not reach the server.");
        setPhase({ name: "missions" });
      }
    },
    [native, target, mode],
  );

  const leaveTo = useCallback(
    (next: Phase) => {
      attempt.current++;
      release();
      setPhase(next);
    },
    [release],
  );

  switch (phase.name) {
    case "splash":
      return <Splash native={native} target={target} onNative={setNative} onTarget={setTarget} onContinue={() => setPhase({ name: "missions" })} />;
    case "missions":
      return <MissionPicker target={target} native={native} mode={mode} onMode={setMode} onPick={pick} onBack={() => setPhase({ name: "splash" })} error={error} />;
    case "preparing":
      return (
        <Shell width="narrow">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-12 text-center text-card-foreground shadow-xs">
            <Loader2 role="status" aria-label="Loading" className="size-6 animate-spin text-primary motion-reduce:animate-none" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Getting your partner ready</p>
              <p className="text-[13px] text-muted-foreground">{phase.mission.title}</p>
            </div>
            <Button variant="outline" onClick={() => leaveTo({ name: "missions" })}>
              Cancel
            </Button>
          </div>
        </Shell>
      );
    case "session":
      return (
        <SessionView
          key={phase.agentId}
          agentId={phase.agentId}
          mission={phase.mission}
          mode={mode}
          target={target}
          native={native}
          correctionsEnabled={correctionsEnabled}
          onCancel={() => leaveTo({ name: "missions" })}
          onFinish={(result) => leaveTo({ name: "summary", mission: phase.mission, result })}
        />
      );
    case "summary":
      return (
        <Summary
          result={phase.result}
          mission={phase.mission}
          mode={mode}
          target={target}
          native={native}
          onRetry={() => void pick(phase.mission)}
          onNew={() => setPhase({ name: "missions" })}
        />
      );
  }
}
