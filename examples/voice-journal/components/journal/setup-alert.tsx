import * as React from "react";
import { View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { health } from "@/lib/api";

export function SetupAlert() {
  const [missing, setMissing] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    health()
      .then((h) => setMissing([!h.cartesia && "CARTESIA_API_KEY", !h.llm && "LLM_MODEL and its provider key"].filter(Boolean) as string[]))
      .catch(() => setMissing(["the API routes (is the Expo server running?)"]));
  }, []);
  if (!missing || missing.length === 0) return null;
  return (
    <View style={{ marginBottom: 32 }}>
      <Alert title="Finish setup">{`Set ${missing.join(" and ")} in .env.local, then restart the dev server.`}</Alert>
    </View>
  );
}
