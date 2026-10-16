"use client"

import * as React from "react"
import { cn } from "cn"
import { Check } from "lucide-react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

function ChoiceChips({
  options,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: {
  options: { value: string; label: React.ReactNode }[]
  value: string[]
  onValueChange: (value: string[]) => void
  className?: string
  "aria-label"?: string
  "aria-labelledby"?: string
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="multiple"
      value={value}
      onValueChange={onValueChange}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className={cn(
            "group inline-flex h-8 items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-[13px] font-medium text-foreground transition-colors outline-none",
            "hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "data-[state=on]:border-primary/40 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
          )}
        >
          <Check className="hidden size-3.5 group-data-[state=on]:block" aria-hidden />
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

export { ChoiceChips }
