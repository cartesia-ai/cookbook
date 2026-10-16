import { AppHeader, AppMain, type Width } from "@/components/blocks/app-shell";
import { ModeToggle } from "./mode-toggle";

export function Shell({ width = "default", className, children }: { width?: Width; className?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader name="Speaking partner" width={width}>
        <ModeToggle />
      </AppHeader>
      <AppMain width={width} className={className}>
        {children}
      </AppMain>
    </div>
  );
}
