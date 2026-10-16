import { PageHeader } from "@/components/blocks/app-shell";
import { FormPanel, FormSection } from "@/components/blocks/form-section";
import { Shell } from "./shell";

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{children}</code>;
}

export function SetupNotice() {
  return (
    <Shell width="narrow">
      <PageHeader title="Add your API key" description="This app needs a Cartesia API key on the server. The key never reaches the browser." />
      <FormPanel>
        <FormSection title="Voice">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground marker:text-muted-foreground">
            <li>
              Copy <Code>.env.example</Code> to <Code>.env.local</Code>.
            </li>
            <li>
              Put your key in <Code>CARTESIA_API_KEY</Code>.
            </li>
            <li>
              Restart <Code>pnpm dev</Code>.
            </li>
          </ol>
        </FormSection>
        <FormSection title="Written corrections" description="Optional. Set one of these to check each line you say.">
          <p className="text-sm text-muted-foreground">
            <Code>ANTHROPIC_API_KEY</Code> or <Code>OPENAI_API_KEY</Code>
          </p>
        </FormSection>
      </FormPanel>
    </Shell>
  );
}
