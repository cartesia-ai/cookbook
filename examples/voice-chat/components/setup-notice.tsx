import { AppMain, PageHeader } from "@/components/blocks/app-shell";
import { FormPanel, FormSection } from "@/components/blocks/form-section";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-[13px] leading-5">
      {children}
    </pre>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <FormSection>
      <div className="flex gap-3">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground">
          {n}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 className="text-sm font-medium leading-5">{title}</h2>
          {children}
        </div>
      </div>
    </FormSection>
  );
}

export function SetupNotice() {
  return (
    <AppMain width="narrow">
      <PageHeader
        title="Create the agent first"
        description="CARTESIA_AGENT_ID is not set. One script creates the agent and saves its id."
      />
      <FormPanel>
        <Step n={1} title="Add your API key to .env.local">
          <Code>CARTESIA_API_KEY=...</Code>
        </Step>
        <Step n={2} title="Create the agent">
          <Code>pnpm setup:agent</Code>
        </Step>
        <Step n={3} title="Restart the dev server">
          <p className="text-[13px] leading-5 text-muted-foreground">The app reads the new agent id when it starts.</p>
        </Step>
      </FormPanel>
    </AppMain>
  );
}
