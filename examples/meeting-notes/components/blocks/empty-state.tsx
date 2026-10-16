import * as React from "react"
import { cn } from "cn"

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center", className)}>
      {icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="max-w-[44ch] text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export { EmptyState }
