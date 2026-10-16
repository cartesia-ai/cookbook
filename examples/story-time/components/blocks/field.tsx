import * as React from "react"
import { cn } from "@/lib/utils"

import { Label } from "../ui/label"

function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label?: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  error?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {label ? <Label htmlFor={htmlFor} className="text-[13px]">{label}</Label> : null}
      {children}
      {error ? (
        <p className="text-xs leading-4 text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function FieldGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>
}

export { Field, FieldGrid }
