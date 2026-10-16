import { AppHeader, type Width } from "@/components/blocks/app-shell";
import { ModeToggle } from "@/components/mode-toggle";

export function SiteHeader({ width }: { width: Width }) {
  return (
    <AppHeader name="Pocket interpreter" width={width}>
      <ModeToggle />
    </AppHeader>
  );
}
