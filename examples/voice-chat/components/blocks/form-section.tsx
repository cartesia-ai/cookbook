import * as React from "react"
import { cn } from "cn"

function FormPanel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("divide-y divide-border rounded-xl border border-border bg-card text-card-foreground shadow-xs", className)}>
      {children}
    </div>
  )
}

function FormSection({
  title,
  description,
  aside,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex flex-col gap-4 p-5 sm:p-6", className)}>
      {title || aside ? (
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            {title ? <h2 className="text-sm font-medium leading-5">{title}</h2> : null}
            {description ? <p className="text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function FormFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col-reverse gap-2 p-5 sm:flex-row sm:items-center sm:justify-end sm:p-6", className)}>{children}</div>
}

export { FormPanel, FormSection, FormFooter }
