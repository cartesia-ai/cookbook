import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, FileQuestion, Trash2 } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { AppMain, PageHeader, Screen } from "@/components/blocks/app-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { JournalHeader } from "@/components/journal/header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { formatDuration, longDay, timeLabel } from "@/lib/journal";
import { retryAnalysis } from "@/lib/pipeline";
import { MOOD_LABELS } from "@/lib/schema";
import { deleteEntry, useJournal } from "@/lib/store";

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { entries, loaded } = useJournal();
  const entry = entries.find((e) => e.id === id);
  const [confirm, setConfirm] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!entry) {
    return (
      <Screen>
        <JournalHeader active="journal" />
        <AppMain width="narrow">
          {loaded ? (
            <EmptyState
              icon={(c) => <FileQuestion size={20} color={c} />}
              title="Entry not found"
              description="It may have been deleted, or it was saved on another device."
              action={<Button variant="outline" size="sm" onPress={() => router.replace("/")}>Back to journal</Button>}
            />
          ) : null}
        </AppMain>
      </Screen>
    );
  }

  const meta = [`${longDay(entry.createdAt)}, ${timeLabel(entry.createdAt)}`, formatDuration(entry.durationSec)].filter(Boolean).join(" · ");

  async function retry() {
    if (!entry) return;
    setRetrying(true);
    setError(null);
    try {
      await retryAnalysis(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write a title and reflection");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Screen>
      <JournalHeader active="journal" />
      <AppMain width="narrow">
        <View style={{ flexDirection: "row", marginBottom: 16, marginLeft: -10 }}>
          <Button variant="ghost" size="sm" icon={(c) => <ArrowLeft size={16} color={c} />} onPress={back}>
            Journal
          </Button>
        </View>
        <PageHeader title={entry.title ?? "Untitled entry"} description={meta} />

        <FormPanel>
          <FormSection title="Reflection" aside={entry.mood ? <Badge>{MOOD_LABELS[entry.mood]}</Badge> : null}>
            {entry.reflection ? (
              <Text style={{ lineHeight: 24 }}>{entry.reflection}</Text>
            ) : (
              <Text variant="label" tone="muted">
                No title or reflection yet. The LLM step did not finish when this entry was saved.
              </Text>
            )}
            {error ? <Alert title="Could not finish">{error}</Alert> : null}
          </FormSection>
          <FormSection title="Transcript" description="Transcribed by Cartesia Ink. Recognition errors stay as they were heard.">
            <Text style={{ lineHeight: 24 }} selectable>
              {entry.transcript}
            </Text>
          </FormSection>
          <FormFooter>
            <Button variant="ghost" icon={(c) => <Trash2 size={16} color={c} />} onPress={() => setConfirm(true)}>
              Delete entry
            </Button>
            {!entry.reflection ? (
              <Button style={{ minWidth: 160 }} loading={retrying} onPress={() => void retry()}>
                Retry
              </Button>
            ) : null}
          </FormFooter>
        </FormPanel>

        <Text variant="hint" tone="muted" style={{ marginTop: 16, textAlign: "center" }}>
          If you&apos;re in crisis in the US, call or text 988.
        </Text>

        <Dialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Delete this entry?"
          description="The transcript and reflection are removed from this device. This cannot be undone."
        >
          <Button variant="outline" onPress={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="stop"
            onPress={async () => {
              setConfirm(false);
              await deleteEntry(entry.id);
              router.replace("/");
            }}
          >
            Delete entry
          </Button>
        </Dialog>
      </AppMain>
    </Screen>
  );
}
