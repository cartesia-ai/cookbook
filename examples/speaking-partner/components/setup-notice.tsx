import { Info } from "lucide-react";
import { PageHeader } from "@/components/blocks/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shell } from "./shell";

export function SetupNotice() {
  return (
    <Shell width="narrow">
      <PageHeader
        title="Practice a language out loud"
        description="Short role plays with a voice partner. After every line you say, a side panel shows what to fix."
      />
      <Alert className="mb-8">
        <Info aria-hidden />
        <AlertTitle>Finish setup</AlertTitle>
        <AlertDescription>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code> and put your Cartesia key in{" "}
            <code>CARTESIA_API_KEY</code>. The key stays on the server.
          </p>
          <p>
            Optional: for written corrections, set <code>LLM_MODEL</code> as provider/model, for example{" "}
            <code>openai/gpt-5.4-mini</code>, plus <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> to match.
          </p>
          <p>Restart the dev server after editing the file.</p>
        </AlertDescription>
      </Alert>
    </Shell>
  );
}
