import { App } from "@/components/app";
import { SetupNotice } from "@/components/setup-notice";
import { getApiKey, hasCorrectionsKey } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!getApiKey()) return <SetupNotice />;
  return <App correctionsEnabled={hasCorrectionsKey()} />;
}
