import { CalendarDays, ChevronRight } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";
import { AppMain, PageHeader, Screen } from "@/components/blocks/app-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { Field } from "@/components/blocks/field";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { Steps } from "@/components/blocks/steps";
import { JournalHeader } from "@/components/journal/header";
import { RecapPlayer } from "@/components/journal/recap-player";
import { SetupAlert } from "@/components/journal/setup-alert";
import { useTheme } from "@/components/theme/theme";
import { radius } from "@/components/theme/tokens";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { listVoices, speak, writeRecap, type VoiceOption } from "@/lib/api";
import { entriesInRange, lastSevenDays, moodCounts, newId, rangeLabel, toRecapEntries, type SavedRecap } from "@/lib/journal";
import { DEFAULT_VOICE_ID, DEFAULT_VOICE_NAME } from "@/lib/limits";
import { MOOD_LABELS } from "@/lib/schema";
import { saveRecap, saveSettings, useJournal } from "@/lib/store";

const DEFAULT_VOICE: VoiceOption = { id: DEFAULT_VOICE_ID, name: DEFAULT_VOICE_NAME, tagline: "Kind Companion" };

export default function RecapScreen() {
  const { entries, recaps, settings, loaded } = useJournal();
  const { colors } = useTheme();
  const [voices, setVoices] = React.useState<VoiceOption[]>([DEFAULT_VOICE]);
  const [step, setStep] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState<SavedRecap | null>(null);
  const [audio, setAudio] = React.useState<Record<string, string>>({});
  const [voicing, setVoicing] = React.useState(false);
  const [autoPlay, setAutoPlay] = React.useState(false);

  const voiceId = settings.voiceId ?? DEFAULT_VOICE_ID;
  const voice = voices.find((v) => v.id === voiceId) ?? { id: voiceId, name: settings.voiceName ?? "Voice", tagline: "" };

  React.useEffect(() => {
    listVoices()
      .then((v) => setVoices([DEFAULT_VOICE, ...v.filter((x) => x.id !== DEFAULT_VOICE.id)]))
      .catch(() => {});
  }, []);

  const { from, to } = React.useMemo(() => lastSevenDays(), []);
  const week = React.useMemo(() => entriesInRange(entries, from, to), [entries, from, to]);
  const usable = toRecapEntries(week);
  const moods = moodCounts(week).slice(0, 4);
  const shown = current ?? (loaded ? (recaps[0] ?? null) : null);

  async function voiceRecap(r: SavedRecap, play: boolean) {
    setVoicing(true);
    setError(null);
    try {
      const uri = await speak(r.text, r.voiceId, r.id);
      setAutoPlay(play);
      setAudio((a) => ({ ...a, [r.id]: uri }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the voice");
    } finally {
      setVoicing(false);
    }
  }

  async function generate() {
    setError(null);
    setStep(0);
    try {
      setStep(1);
      const out = await writeRecap(usable);
      const r: SavedRecap = {
        id: newId(),
        createdAt: new Date().toISOString(),
        from: from.toISOString(),
        to: to.toISOString(),
        entryCount: usable.length,
        title: out.title,
        text: out.text,
        voiceId: voice.id,
        voiceName: voice.name,
      };
      await saveRecap(r);
      setCurrent(r);
      setStep(2);
      const uri = await speak(r.text, r.voiceId, r.id);
      setAutoPlay(true);
      setAudio((a) => ({ ...a, [r.id]: uri }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the recap");
    } finally {
      setStep(null);
    }
  }

  const steps = [`Reading ${usable.length} ${usable.length === 1 ? "entry" : "entries"}`, "Writing the recap", `Recording it in ${voice.name}'s voice`];
  const earlier = recaps.filter((r) => r.id !== shown?.id);

  return (
    <Screen>
      <JournalHeader active="recap" />
      <AppMain width="narrow">
        <PageHeader title="Weekly recap" description="The app reads your last seven days of entries, writes a short note about the week and reads it to you in a Sonic 3.6 voice." />
        <SetupAlert />

        <FormPanel>
          <FormSection title="This week" description={rangeLabel(from, to)} aside={<Badge>{`${week.length} ${week.length === 1 ? "entry" : "entries"}`}</Badge>}>
            {moods.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {moods.map((m) => (
                  <Badge key={m.mood}>{`${MOOD_LABELS[m.mood]} ${m.count}`}</Badge>
                ))}
              </View>
            ) : (
              <Text variant="label" tone="muted">
                No entries in the last seven days yet. Record one on the Journal page first.
              </Text>
            )}
          </FormSection>
          <FormSection title="Voice">
            <Field label="Read by" hint="Public English voices from the Cartesia library.">
              <Select
                accessibilityLabel="Voice"
                value={voice.id}
                options={voices.map((v) => ({ value: v.id, label: v.name, hint: v.tagline }))}
                onValueChange={(id) => {
                  const v = voices.find((x) => x.id === id);
                  void saveSettings({ voiceId: id, voiceName: v?.name ?? null });
                }}
              />
            </Field>
          </FormSection>
          <FormFooter>
            <Button style={{ minWidth: 160 }} disabled={usable.length === 0 || step !== null} loading={step !== null} onPress={() => void generate()}>
              {step !== null ? "Writing" : "Write my recap"}
            </Button>
          </FormFooter>
        </FormPanel>

        {step !== null ? (
          <View style={{ marginTop: 40, gap: 16 }}>
            <Text weight="medium">Progress</Text>
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.card, padding: 20 }}>
              <Steps steps={steps} current={step} />
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={{ marginTop: 24 }}>
            <Alert variant="destructive" title="Could not finish">{error}</Alert>
          </View>
        ) : null}

        {shown && step === null ? (
          <View style={{ marginTop: 40, gap: 16 }}>
            <Text weight="medium" accessibilityRole="header" aria-level={2}>
              {shown.id === recaps[0]?.id ? "Latest recap" : "Recap"}
            </Text>
            <FormPanel>
              <FormSection title={shown.title} description={`${rangeLabel(shown.from, shown.to)} · ${shown.entryCount} ${shown.entryCount === 1 ? "entry" : "entries"} · read by ${shown.voiceName}`}>
                <RecapPlayer key={shown.id} uri={audio[shown.id] ?? null} autoPlay={autoPlay} loading={voicing} onNeedAudio={() => void voiceRecap(shown, true)} />
              </FormSection>
              <FormSection>
                <Text style={{ lineHeight: 24 }} selectable>
                  {shown.text}
                </Text>
              </FormSection>
            </FormPanel>
          </View>
        ) : null}

        <View style={{ marginTop: 40, gap: 16 }}>
          <Text weight="medium" accessibilityRole="header" aria-level={2}>
            Earlier recaps
          </Text>
          {earlier.length === 0 ? (
            <EmptyState icon={(c) => <CalendarDays size={20} color={c} />} title="No earlier recaps" description="Each recap you write is kept here, on this device." />
          ) : (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.card, overflow: "hidden" }}>
              {earlier.map((r, i) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setAutoPlay(false);
                    setCurrent(r);
                  }}
                  style={(s) => {
                    const { hovered, pressed } = s as { hovered?: boolean; pressed: boolean };
                    return [
                      {
                        minHeight: 60,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                        backgroundColor: hovered || pressed ? colors.muted : "transparent",
                      } as ViewStyle,
                      Platform.OS === "web" ? ({ cursor: "pointer", outlineStyle: "none" } as unknown as ViewStyle) : null,
                    ];
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text weight="medium" numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text variant="hint" tone="muted" numberOfLines={1}>
                      {`${rangeLabel(r.from, r.to)} · ${r.entryCount} ${r.entryCount === 1 ? "entry" : "entries"} · ${r.voiceName}`}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </AppMain>
    </Screen>
  );
}
