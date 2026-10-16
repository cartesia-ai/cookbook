"use client";

import { useCartesiaAgent } from "@/lib/agents-web/react";
import { VoiceChatView } from "./voice-chat-view";

async function getToken(): Promise<string> {
  const res = await fetch("/api/token", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? `Token request failed (${res.status})`);
  return body.token;
}

export function VoiceChat({ agentId }: { agentId: string }) {
  const agent = useCartesiaAgent({
    agentId,
    getToken,
    // Echo cancellation is the default in agents-web; the 16 kHz input format is too.
    // outputDelivery stays "as_available": the client owns the playback queue, which is
    // what lets it drop audio the moment the agent is interrupted.
  });

  return (
    <VoiceChatView
      status={agent.status}
      messages={agent.messages}
      userSpeaking={agent.isSpeaking.user}
      agentSpeaking={agent.isSpeaking.agent}
      muted={agent.muted}
      error={agent.error ? { code: agent.error.code, message: agent.error.message } : null}
      onStart={() => void agent.start().catch(() => {})}
      onStop={() => void agent.stop()}
      onToggleMute={() => agent.setMuted(!agent.muted)}
    />
  );
}
