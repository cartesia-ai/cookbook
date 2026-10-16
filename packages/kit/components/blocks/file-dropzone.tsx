"use client"

import * as React from "react"
import { cn } from "cn"
import { FileText, Upload, X } from "lucide-react"

import { Button } from "../ui/button"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileDropzone({
  id,
  accept,
  file,
  onFileChange,
  hint,
  maxBytes,
  disabled,
  className,
}: {
  id?: string
  accept?: string
  file: File | null
  onFileChange: (file: File | null) => void
  hint?: React.ReactNode
  maxBytes?: number
  disabled?: boolean
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function take(next: File | undefined | null) {
    setError(null)
    if (!next) return
    if (maxBytes && next.size > maxBytes) {
      setError(`That file is ${formatSize(next.size)}. The limit is ${formatSize(maxBytes)}.`)
      return
    }
    onFileChange(next)
  }

  if (file) {
    return (
      <div className={cn("flex h-14 items-center gap-3 rounded-lg border border-border bg-muted/40 px-3", className)}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border">
          <FileText className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{file.name}</span>
          <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${file.name}`}
          disabled={disabled}
          onClick={() => {
            onFileChange(null)
            if (inputRef.current) inputRef.current.value = ""
          }}
        >
          <X />
        </Button>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) take(e.dataTransfer.files?.[0])
        }}
        className={cn(
          "group flex h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-background px-4 text-center transition-colors",
          "hover:border-primary/60 hover:bg-accent/30 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
          dragging && "border-primary bg-accent/40",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
          <Upload className="size-4" aria-hidden />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-sm">
            <span className="font-medium text-primary">Choose a file</span>
            <span className="text-muted-foreground"> or drag it here</span>
          </span>
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

export { FileDropzone, formatSize }
