import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PillState = "idle" | "connecting" | "listening" | "hearing" | "speaking" | "ended" | "error";

const LABEL: Record<PillState, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  hearing: "Hearing you",
  speaking: "Speaking",
  ended: "Call ended",
  error: "Error",
};

export function StatusPill({ state, muted }: { state: PillState; muted?: boolean }) {
  const label = muted && (state === "listening" || state === "hearing") ? "Listening (mic muted)" : LABEL[state];
  const live = state === "listening" || state === "hearing" || state === "speaking";
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
        live
          ? "border-primary/30 bg-accent text-accent-foreground"
          : state === "error"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-border bg-background text-muted-foreground",
      )}
    >
      {state === "connecting" ? (
        <Loader2 aria-hidden className="size-3 animate-spin" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            live ? "bg-primary" : state === "error" ? "bg-destructive" : "bg-muted-foreground/60",
            (state === "hearing" || state === "speaking") && "animate-pulse",
          )}
        />
      )}
      {label}
    </span>
  );
}
