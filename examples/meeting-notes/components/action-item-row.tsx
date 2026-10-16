"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ActionItem } from "@/lib/schema";

export function ActionItemRow({
  item,
  onToggle,
  className,
}: {
  item: ActionItem;
  onToggle: (done: boolean) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5", className)}>
      <Checkbox
        checked={item.done}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className="mt-0.5 cursor-pointer"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-sm leading-5", item.done && "text-muted-foreground line-through")}>{item.task}</span>
        {item.owner && <span className="text-xs text-muted-foreground">{item.owner}</span>}
      </span>
    </label>
  );
}
