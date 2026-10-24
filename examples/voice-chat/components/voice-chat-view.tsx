import { MessageSquare } from "lucide-react";
import { AppMain, PageHeader } from "@/components/blocks/app-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { FormPanel } from "@/components/blocks/form-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Controls } from "./controls";
import { Orb, type OrbState } from "./orb";
import { StatusPill, type PillState } from "./status-pill";
import { Transcript, type ChatMessage } from "./transcript";

export type CallStatus = "idle" | "connecting" | "ready" | "closing" | "closed" | "error";

export interface VoiceChatViewProps {
  status: CallStatus;
  messages: ChatMessage[];
  userSpeaking: boolean;
  agentSpeaking: boolean;
  muted: boolean;
  error: { code: string; message: string } | null;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

function getVisualState(p: VoiceChatViewProps): { orb: OrbState; pill: PillState } {
  if (p.error) return { orb: "idle", pill: "error" };
  if (p.status === "connecting") return { orb: "connecting", pill: "connecting" };
  if (p.status === "ready") {
    if (p.agentSpeaking) return { orb: "speaking", pill: "speaking" };
    if (p.userSpeaking) return { orb: "hearing", pill: "hearing" };
    return { orb: "listening", pill: "listening" };
  }
  if (p.status === "closed" || p.status === "closing") return { orb: "idle", pill: "ended" };
  return { orb: "idle", pill: "idle" };
}

function ErrorAlert({ error }: { error: { code: string; message: string } }) {
  const denied = error.code === "mic_denied" || error.code === "mic_unavailable";
  return (
    <Alert variant="destructive">
      <AlertTitle>{denied ? "The microphone is blocked" : "The call stopped"}</AlertTitle>
      <AlertDescription>
        {denied ? (
          <p>
            Allow microphone access for this site in the address bar, then try again. Check that no other app is using
            the microphone.
          </p>
        ) : (
          <p>
            {error.message} <span className="font-mono text-xs">({error.code})</span>
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function VoiceChatView(props: VoiceChatViewProps) {
  const { status, messages, error } = props;
  const inCall = status === "connecting" || status === "ready";
  const ended = (status === "closed" || status === "closing") && messages.length > 0;
  const { orb, pill } = getVisualState(props);

  return (
    <AppMain width="narrow">
      <PageHeader
        title="Talk to your agent"
        description="Start a call and speak. Talk over the agent at any time and it stops to listen."
      />
      <FormPanel className="flex flex-col">
        <section className="flex flex-col items-center gap-4 px-5 py-6 sm:py-8">
          <Orb state={orb} />
          <StatusPill state={pill} muted={props.muted} />
        </section>
        <section className="h-80 sm:h-88">
          <Transcript
            messages={messages}
            userSpeaking={props.userSpeaking && status === "ready"}
            empty={
              <EmptyState
                icon={<MessageSquare />}
                title={inCall ? "Say hello" : "The transcript shows up here"}
                description={inCall ? "The agent replies out loud and the words appear here." : "Start a call and say hello."}
                className="my-auto border-0 py-0"
              />
            }
          />
        </section>
        {error ? (
          <section className="p-5 sm:p-6">
            <ErrorAlert error={error} />
          </section>
        ) : null}
        <Controls
          inCall={inCall}
          muted={props.muted}
          starting={false}
          retry={Boolean(error)}
          startLabel={ended ? "Start a new call" : "Start call"}
          hint="Headphones work best. Speakers can make the agent hear itself. Audio is processed and recorded by Cartesia."
          onStart={props.onStart}
          onStop={props.onStop}
          onToggleMute={props.onToggleMute}
        />
      </FormPanel>
    </AppMain>
  );
}
