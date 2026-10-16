import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, RotateCcw } from "lucide-react";

export function Controls({
  inCall,
  muted,
  starting,
  hint,
  startLabel = "Start call",
  retry,
  onStart,
  onStop,
  onToggleMute,
}: {
  inCall: boolean;
  muted: boolean;
  starting: boolean;
  hint?: React.ReactNode;
  startLabel?: string;
  retry?: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}) {
  if (!inCall) {
    return (
      <div className="flex flex-col-reverse gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        {hint ? <p className="text-xs leading-4 text-muted-foreground">{hint}</p> : <span />}
        <Button onClick={onStart} disabled={starting} className="w-full sm:w-auto sm:min-w-40">
          {retry ? <RotateCcw /> : <Mic />} {retry ? "Try again" : startLabel}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-5 sm:justify-between sm:p-6">
      <Button
        variant="outline"
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
        aria-pressed={muted}
        onClick={onToggleMute}
        className="min-w-28 aria-pressed:border-destructive/40 aria-pressed:text-destructive"
      >
        {muted ? <MicOff /> : <Mic />}
        {muted ? "Unmute" : "Mute"}
      </Button>
      <Button variant="outline" onClick={onStop} aria-label="End call" className="flex-1 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive sm:flex-none sm:min-w-40 dark:border-destructive/40 dark:bg-destructive/15">
        <PhoneOff /> End call
      </Button>
    </div>
  );
}
