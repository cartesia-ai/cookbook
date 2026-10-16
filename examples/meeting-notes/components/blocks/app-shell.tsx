import * as React from "react"
import { cn } from "cn"

const widths = {
  narrow: "max-w-2xl",
  default: "max-w-3xl",
  wide: "max-w-5xl",
} as const

type Width = keyof typeof widths

function AppHeader({
  name,
  href = "/",
  width = "default",
  children,
}: {
  name: string
  href?: string
  width?: Width
  children?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className={cn("mx-auto flex h-14 items-center justify-between gap-4 px-4 sm:px-6", widths[width])}>
        <a href={href} className="rounded-md text-sm font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {name}
        </a>
        <div className="flex items-center gap-1">{children}</div>
      </div>
    </header>
  )
}

function AppNavLink({
  href,
  active,
  children,
}: {
  href: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </a>
  )
}

function AppMain({
  width = "default",
  className,
  children,
}: {
  width?: Width
  className?: string
  children: React.ReactNode
}) {
  return (
    <main className={cn("mx-auto w-full px-4 pt-10 pb-20 sm:px-6 sm:pt-14", widths[width], className)}>
      {children}
    </main>
  )
}

function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem] sm:leading-9">{title}</h1>
        {description ? <p className="max-w-[60ch] text-sm leading-6 text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export { AppHeader, AppNavLink, AppMain, PageHeader }
export type { Width }
