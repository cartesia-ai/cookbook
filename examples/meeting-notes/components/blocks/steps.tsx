import * as React from "react"
import { cn } from "cn"
import { Check, Loader2 } from "lucide-react"

function Steps({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-2.5", className)} aria-live="polite">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className={cn("flex items-center gap-3 text-sm", done ? "text-muted-foreground" : active ? "font-medium text-foreground" : "text-muted-foreground/70")}>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary/50 text-primary" : "border-border"
              )}
            >
              {done ? <Check className="size-3" aria-hidden /> : active ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

export { Steps }
