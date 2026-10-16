import { cn } from "@/lib/utils";

export type OrbState = "idle" | "connecting" | "listening" | "hearing" | "speaking";

export function Orb({ state, className }: { state: OrbState; className?: string }) {
  return (
    <div aria-hidden data-state={state} className={cn("sp-orb relative grid size-28 place-items-center", className)}>
      <div className={cn("absolute inset-0 rounded-full bg-primary/10 transition-opacity duration-300", state === "idle" ? "opacity-40" : "opacity-100")} />
      <div className="absolute inset-3 rounded-full bg-primary/20" />
      <div className="sp-core relative size-14 rounded-full bg-primary" />
    </div>
  );
}

export type PillState = OrbState | "ended" | "error";

const LABEL: Record<PillState, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  hearing: "Hearing you",
  speaking: "Speaking",
  ended: "Ended",
  error: "Error",
};

export function StatusPill({ state, muted }: { state: PillState; muted?: boolean }) {
  const label = muted && (state === "listening" || state === "hearing") ? "Listening (mic muted)" : LABEL[state];
  return (
    <div role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-card-foreground">
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", state === "error" ? "bg-destructive" : state === "speaking" || state === "hearing" ? "bg-primary" : "bg-muted-foreground")}
      />
      {label}
    </div>
  );
}
