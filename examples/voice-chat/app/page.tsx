import { SetupNotice } from "../components/setup-notice";
import { VoiceChat } from "../components/voice-chat";
import { getAgentId } from "../lib/env";

export const dynamic = "force-dynamic";

export default function Page() {
  const agentId = getAgentId();
  return agentId ? <VoiceChat agentId={agentId} /> : <SetupNotice />;
}
