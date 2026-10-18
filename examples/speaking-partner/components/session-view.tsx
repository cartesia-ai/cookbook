"use client";

import { useCartesiaAgent } from "@/lib/agents-web/react";
import { PageHeader } from "@/components/blocks/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchToken } from "@/lib/client-api";
import { playChime } from "@/lib/chime";
import { languageName, type LanguageCode } from "@/lib/languages";
import type { Mission } from "@/lib/missions";
import { COMPLETE_TOOL_NAME } from "@/lib/prompts";
import type { Mode } from "@/lib/modes";
import { SESSION_SECONDS, useCountdown } from "@/lib/session-limit";
import { useCorrections, type CorrectionItem } from "@/lib/use-corrections";
import { CorrectionsPanel } from "./corrections-panel";
import { Orb, StatusPill, type OrbState, type PillState } from "./orb";
import { Shell } from "./shell";
import { Transcript } from "./transcript";

export interface SessionResult {
  reason: "completed" | "ended" | "timeout";
  score?: number;
  pointers?: string[];
  corrections: CorrectionItem[];
}

const SETTLE_MS = 700;
const MAX_GOODBYE_MS = 20_000;

function parseCompletion(params: Record<string, unknown>): { score: number; pointers: string[] } {
  const score = typeof params.score === "number" ? Math.max(0, Math.min(3, Math.round(params.score))) : 0;
  const pointers = Array.isArray(params.feedback_pointers) ? params.feedback_pointers.filter((p): p is string => typeof p === "string").slice(0, 5) : [];
  return { score, pointers };
}

function fmt(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SessionView({
  agentId,
  mission,
  mode,
  target,
  native,
  correctionsEnabled,
  onFinish,
  onCancel,
}: {
  agentId: string;
  mission: Mission;
  mode: Mode;
  target: LanguageCode;
  native: LanguageCode;
  correctionsEnabled: boolean;
  onFinish: (result: SessionResult) => void;
  onCancel: () => void;
}) {
  const completion = useRef<{ score: number; pointers: string[] } | null>(null);
  const finishing = useRef(false);
  const [completed, setCompleted] = useState(false);
  const [showCorrections, setShowCorrections] = useState(mode === "teacher");
  const itemsRef = useRef<CorrectionItem[]>([]);

  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const stopRef = useRef<() => Promise<void>>(async () => undefined);

  const finish = useCallback((reason: SessionResult["reason"]) => {
    if (finishing.current) return;
    finishing.current = true;
    void stopRef.current();
    onFinishRef.current({
      reason,
      score: completion.current?.score,
      pointers: completion.current?.pointers,
      corrections: itemsRef.current,
    });
  }, []);

  const agent = useCartesiaAgent({
    agentId,
    getToken: fetchToken,
    tools: {
      [COMPLETE_TOOL_NAME]: (params) => {
        if (completion.current) return;
        completion.current = parseCompletion(params);
        setCompleted(true);
      },
    },
  });
  stopRef.current = agent.stop;
  const live = agent.status === "connecting" || agent.status === "ready";
  const { items, retry } = useCorrections({ messages: agent.messages, enabled: correctionsEnabled, target, native, mission: mission.title });
  itemsRef.current = items;

  const secondsLeft = useCountdown(agent.status === "ready", SESSION_SECONDS, () => finish("timeout"));

  const begin = () => {
    playChime("start");
    void agent.start().catch(() => undefined);
  };

  const partnerSpeaking = agent.isSpeaking.agent;
  useEffect(() => {
    if (!completed || partnerSpeaking) return;
    const t = setTimeout(() => {
      playChime("finish");
      finish("completed");
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [completed, partnerSpeaking, finish]);
  useEffect(() => {
    if (!completed) return;
    const t = setTimeout(() => finish("completed"), MAX_GOODBYE_MS);
    return () => clearTimeout(t);
  }, [completed, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && agent.status === "ready") finish("ended");
      if ((e.key === "m" || e.key === "M") && agent.status === "ready") agent.setMuted(!agent.muted);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agent, finish]);

  const orb: OrbState = agent.status === "connecting" ? "connecting" : agent.status === "ready" ? (agent.isSpeaking.agent ? "speaking" : agent.isSpeaking.user ? "hearing" : "listening") : "idle";
  const pill: PillState = agent.error ? "error" : orb;
  const micDenied = agent.error?.code === "mic_denied" || agent.error?.code === "mic_unavailable";
  const started = live || agent.messages.length > 0;

  return (
    <Shell width="wide">
      <PageHeader
        title={mission.title}
        description={`${mission.target_role}, in ${languageName(target)}. ${mode === "teacher" ? "Teacher" : "Immersive"} mode.`}
        actions={
          <>
            {agent.status === "ready" ? (
              <span className="font-mono text-sm tabular-nums text-muted-foreground" aria-label="Time left">
                {fmt(secondsLeft)}
              </span>
            ) : null}
            <StatusPill state={pill} muted={agent.muted} />
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <section className="flex flex-col items-center gap-5 rounded-xl border border-border bg-card px-5 py-8 text-card-foreground shadow-xs sm:px-6" aria-label="Call">
          <Orb state={orb} />
          {!live ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" onClick={onCancel}>
                Back
              </Button>
              <Button className="sm:min-w-40" onClick={begin}>
                <Mic /> {agent.error ? "Try again" : "Start speaking"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant={agent.muted ? "destructive" : "outline"}
                size="icon"
                aria-label={agent.muted ? "Unmute microphone (M)" : "Mute microphone (M)"}
                aria-pressed={agent.muted}
                onClick={() => agent.setMuted(!agent.muted)}
              >
                {agent.muted ? <MicOff /> : <Mic />}
              </Button>
              <Button variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/40 dark:bg-destructive/15" aria-label="End session (Escape)" onClick={() => finish("ended")}>
                <PhoneOff /> End
              </Button>
            </div>
          )}
          {agent.error ? (
            <Alert variant="destructive" className="max-w-md">
              <AlertTitle>{micDenied ? "The microphone is blocked" : "The session stopped"}</AlertTitle>
              <AlertDescription>
                {micDenied ? "Allow microphone access for this site in the address bar, then try again." : agent.error.message}
              </AlertDescription>
            </Alert>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {started ? "M mutes, Escape ends." : "Headphones work best, so your partner does not hear itself."}
          </p>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="flex h-96 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs md:h-[28rem]" aria-label="Transcript">
            <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
              <h2 className="text-sm font-medium">Transcript</h2>
            </div>
            <div className="min-h-0 flex-1">
              {started ? (
                <Transcript messages={agent.messages} userSpeaking={agent.isSpeaking.user && agent.status === "ready"} lang={target} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                  <p className="text-sm font-medium text-balance">{mission.desc}</p>
                  <p className="text-[13px] text-muted-foreground">
                    You speak first, in {languageName(target)}. You have {fmt(SESSION_SECONDS)}.
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="flex max-h-96 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs md:h-[28rem] md:max-h-none" aria-label="Corrections">
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                Corrections
                {items.length ? <span className="text-xs font-normal text-muted-foreground tabular-nums">{items.length}</span> : null}
              </h2>
              <Button variant="ghost" size="sm" className="-mr-2" aria-expanded={showCorrections} onClick={() => setShowCorrections((v) => !v)}>
                {showCorrections ? "Hide" : "Show"}
              </Button>
            </div>
            {showCorrections ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <CorrectionsPanel items={items} target={target} native={native} enabled={correctionsEnabled} onRetry={retry} />
              </div>
            ) : (
              <p className="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-center text-[13px] text-muted-foreground">
                Hidden while you talk. Show them any time.
              </p>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  );
}
