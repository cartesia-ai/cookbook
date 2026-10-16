import * as React from "react";
import { AppHeader, AppNavLink, ModeToggle } from "@/components/blocks/app-shell";

export function JournalHeader({ active }: { active: "journal" | "recap" | null }) {
  return (
    <AppHeader name="Voice journal" width="narrow">
      <AppNavLink href="/" active={active === "journal"}>
        Journal
      </AppNavLink>
      <AppNavLink href="/recap" active={active === "recap"}>
        Recap
      </AppNavLink>
      <ModeToggle />
    </AppHeader>
  );
}
