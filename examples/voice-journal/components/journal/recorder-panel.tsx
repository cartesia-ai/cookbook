import { useFocusEffect } from "expo-router";
import { Mic, Square, X } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { useTheme } from "@/components/theme/theme";
import { radius } from "@/components/theme/tokens";
import { PRIVACY_NOTE } from "@/components/journal/entry-list";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { deleteRecording } from "@/lib/audio-file";
import { formatDuration } from "@/lib/journal";
import { useRecorder } from "@/lib/use-recorder";

const BARS = 24;

export function RecorderPanel({ busy, onRecorded }: { busy: boolean; onRecorded: (uri: string, seconds: number) => void }) {
  const { colors } = useTheme();
  const rec = useRecorder();
  const [history, setHistory] = React.useState<number[]>(() => Array(BARS).fill(0));
  const finishing = React.useRef(false);

  const finish = React.useCallback(
    async (discard: boolean) => {
      if (finishing.current) return;
      finishing.current = true;
      try {
        const out = await rec.stop();
        setHistory(Array(BARS).fill(0));
        if (!out) return;
        if (discard) deleteRecording(out.uri);
        else onRecorded(out.uri, out.seconds);
      } finally {
        finishing.current = false;
      }
    },
    [rec, onRecorded],
  );

  const live = React.useRef({ level: 0, seconds: 0, recording: false, finish });
  React.useEffect(() => {
    live.current = { level: rec.level, seconds: rec.seconds, recording: rec.isRecording, finish };
  });
  React.useEffect(() => {
    if (!rec.isRecording) return;
    const id = setInterval(() => {
      const { level, seconds, finish: stop } = live.current;
      setHistory((h) => [...h.slice(1), level]);
      if (seconds >= rec.maxSeconds) {
        clearInterval(id);
        void stop(false);
      }
    }, 100);
    return () => clearInterval(id);
  }, [rec.isRecording, rec.maxSeconds]);

  useFocusEffect(
    React.useCallback(
      () => () => {
        if (live.current.recording) void live.current.finish(false);
      },
      [],
    ),
  );

  return (
    <FormPanel>
      <FormSection title="New entry" description="Talk for a minute or two, up to four. Only the text is kept. The app deletes the audio after transcribing it.">
        <View
          style={{
            height: 120,
            borderRadius: radius.lg,
            backgroundColor: colors.track,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <Text
            weight="semibold"
            style={{ fontSize: 28, lineHeight: 32, fontVariant: ["tabular-nums"], color: rec.isRecording ? colors.foreground : colors.mutedForeground }}
            accessibilityLabel={`Recording time ${formatDuration(rec.seconds)}`}
          >
            {formatDuration(rec.seconds)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 28 }} aria-hidden>
            {history.map((v, i) => (
              <View
                key={i}
                style={{
                  width: 3,
                  height: 4 + v * 24,
                  borderRadius: 2,
                  backgroundColor: rec.isRecording ? colors.primary : colors.border,
                  opacity: rec.isRecording ? 0.35 + v * 0.65 : 1,
                }}
              />
            ))}
          </View>
        </View>
        {rec.error ? (
          <Text variant="hint" tone="destructive">
            {rec.error}
          </Text>
        ) : (
          <Text variant="hint" tone="muted">
            {rec.isRecording ? "Recording. Tap Stop and save when you are done." : PRIVACY_NOTE}
          </Text>
        )}
      </FormSection>
      <FormFooter>
        {rec.isRecording ? (
          <>
            <Button
              variant="ghost"
              icon={(c) => <X size={16} color={c} />}
              disabled={rec.busy}
              onPress={() => void finish(true)}
            >
              Discard
            </Button>
            <Button variant="stop" style={{ minWidth: 160 }} icon={(c) => <Square size={14} color={c} fill={c} />} disabled={rec.busy} onPress={() => void finish(false)}>
              Stop and save
            </Button>
          </>
        ) : (
          <Button style={{ minWidth: 160 }} loading={busy} disabled={busy || rec.busy} icon={(c) => <Mic size={16} color={c} />} onPress={() => void rec.start()}>
            {busy ? "Saving entry" : "Start recording"}
          </Button>
        )}
      </FormFooter>
    </FormPanel>
  );
}
