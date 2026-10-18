import { Info } from "lucide-react";
import { AppMain, PageHeader } from "@/components/blocks/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SetupNotice() {
  return (
    <AppMain width="narrow">
      <PageHeader
        title="Talk to your agent"
        description="Start a call and speak. Talk over the agent at any time and it stops to listen."
      />
      <Alert className="mb-8">
        <Info aria-hidden />
        <AlertTitle>Finish setup</AlertTitle>
        <AlertDescription>
          <p>
            <code>CARTESIA_AGENT_ID</code> is not set. One script creates the agent and saves its id.
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Add <code>CARTESIA_API_KEY</code> to <code>.env.local</code>.
            </li>
            <li>
              Run <code>npm run setup:agent</code> to create the agent.
            </li>
            <li>Restart the dev server so the app reads the new agent id.</li>
          </ol>
        </AlertDescription>
      </Alert>
    </AppMain>
  );
}
