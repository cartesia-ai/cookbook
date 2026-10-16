import { cn } from "@/lib/utils";

export type OrbState = "idle" | "connecting" | "listening" | "hearing" | "speaking";

export function Orb({ state, className }: { state: OrbState; className?: string }) {
  const idle = state === "idle";
  return (
    <div aria-hidden data-state={state} className={cn("vc-orb relative grid size-32 place-items-center", className)}>
      <div
        className={cn(
          "absolute inset-0 rounded-full bg-primary/10 transition-opacity duration-300",
          idle ? "opacity-50" : "opacity-100",
        )}
      />
      <div
        className={cn(
          "absolute inset-4 rounded-full bg-primary/15 transition-opacity duration-300",
          idle ? "opacity-60" : "opacity-100",
        )}
      />
      <div
        className={cn(
          "vc-core relative size-16 rounded-full bg-primary transition-opacity duration-300",
          idle && "opacity-80",
        )}
      />
    </div>
  );
}
