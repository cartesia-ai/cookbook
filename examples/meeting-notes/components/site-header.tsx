"use client";

import { usePathname } from "next/navigation";
import { AppHeader, AppNavLink } from "@/components/blocks/app-shell";
import { ModeToggle } from "@/components/mode-toggle";

export function SiteHeader() {
  const pathname = usePathname();
  const onActions = pathname.startsWith("/actions");

  return (
    <AppHeader name="Meeting notes">
      <AppNavLink href="/" active={!onActions}>
        Meetings
      </AppNavLink>
      <AppNavLink href="/actions" active={onActions}>
        Action items
      </AppNavLink>
      <ModeToggle />
    </AppHeader>
  );
}
