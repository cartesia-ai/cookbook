import { AppHeader, AppMain, PageHeader } from "@/components/blocks/app-shell";
import { ModeToggle } from "@/components/mode-toggle";
import { SetupBanner } from "@/components/setup-banner";
import { Studio } from "@/components/studio";

export default function Page() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader name="Article to podcast" width="narrow">
        <ModeToggle />
      </AppHeader>
      <AppMain width="narrow">
        <PageHeader
          title="Turn an article into a podcast"
          description="Paste a link or the text. A language model writes a script for two hosts, and Sonic 3.6 voices every line."
        />
        <SetupBanner />
        <Studio />
      </AppMain>
    </div>
  );
}
