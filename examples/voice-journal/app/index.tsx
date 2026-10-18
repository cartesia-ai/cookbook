import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { AppMain, PageHeader, Screen } from "@/components/blocks/app-shell";
import { Steps } from "@/components/blocks/steps";
import { EntryList } from "@/components/journal/entry-list";
import { JournalHeader } from "@/components/journal/header";
import { RecorderPanel } from "@/components/journal/recorder-panel";
import { SetupAlert } from "@/components/journal/setup-alert";
import { useTheme } from "@/components/theme/theme";
import { radius } from "@/components/theme/tokens";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { deleteRecording } from "@/lib/audio-file";
import type { Entry } from "@/lib/journal";
import { createEntry, ENTRY_STEPS } from "@/lib/pipeline";
import { MOOD_LABELS } from "@/lib/schema";
import { useJournal } from "@/lib/store";

export default function JournalScreen() {
  const { entries } = useJournal();
  const [step, setStep] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [latest, setLatest] = React.useState<Entry | null>(null);

  const onRecorded = React.useCallback(async (uri: string, seconds: number) => {
    setError(null);
    setLatest(null);
    setStep(0);
    try {
      const { entry, analysisError } = await createEntry(uri, seconds, setStep);
      setLatest(entry);
      if (analysisError) setError(`The transcript is saved, but ${analysisError.charAt(0).toLowerCase()}${analysisError.slice(1)}. Open the entry to retry.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the entry");
    } finally {
      deleteRecording(uri);
      setStep(null);
    }
  }, []);

  const latestLive = latest ? (entries.find((e) => e.id === latest.id) ?? null) : null;

  return (
    <Screen>
      <JournalHeader active="journal" />
      <AppMain width="narrow">
        <PageHeader title="How was today?" description="Record a voice entry. Ink transcribes it, then the app adds a title, a mood and a one-line reflection." />
        <SetupAlert />
        <RecorderPanel busy={step !== null} onRecorded={onRecorded} />

        {step !== null ? (
          <Section title="Progress">
            <Card>
              <Steps steps={ENTRY_STEPS} current={step} />
            </Card>
          </Section>
        ) : null}

        {error ? (
          <View style={{ marginTop: 24 }}>
            <Alert variant="destructive" title="Could not finish">{error}</Alert>
          </View>
        ) : null}

        {latestLive && step === null ? <LatestEntry entry={latestLive} /> : null}

        <View style={{ marginTop: 40 }}>
          <EntryList entries={entries} />
        </View>
      </AppMain>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 40, gap: 16 }}>
      <Text weight="medium" accessibilityRole="header" aria-level={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.card, padding: 20, gap: 12 }}>{children}</View>;
}

function LatestEntry({ entry }: { entry: Entry }) {
  const router = useRouter();
  if (!entry.title) return null;
  return (
    <Section title="Just saved">
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {entry.title}
          </Text>
          {entry.mood ? <Badge>{MOOD_LABELS[entry.mood]}</Badge> : null}
        </View>
        {entry.reflection ? <Text style={{ lineHeight: 24 }}>{entry.reflection}</Text> : null}
        <Text variant="label" tone="muted" numberOfLines={3}>
          {entry.transcript}
        </Text>
        <View style={{ flexDirection: "row", marginLeft: -12 }}>
          <Button variant="ghost" size="sm" onPress={() => router.push({ pathname: "/entry/[id]", params: { id: entry.id } })}>
            Open entry
          </Button>
        </View>
      </Card>
    </Section>
  );
}
