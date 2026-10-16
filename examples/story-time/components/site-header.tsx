import { AppHeader } from "@/components/blocks/app-shell";
import { ModeToggle } from "@/components/mode-toggle";

export function SiteHeader() {
  return (
    <AppHeader name="Story time" width="narrow">
      <ModeToggle />
    </AppHeader>
  );
}
