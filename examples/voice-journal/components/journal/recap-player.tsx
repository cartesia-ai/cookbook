import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { useTheme } from "@/components/theme/theme";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { formatDuration } from "@/lib/journal";

export function RecapPlayer({
  uri,
  autoPlay,
  loading,
  onNeedAudio,
}: {
  uri: string | null;
  autoPlay: boolean;
  loading: boolean;
  onNeedAudio: () => void;
}) {
  const { colors } = useTheme();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loadedUri = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!uri || loadedUri.current === uri) return;
    loadedUri.current = uri;
    player.replace({ uri });
    if (autoPlay) {
      void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).finally(() => player.play());
    }
  }, [uri, autoPlay, player]);

  React.useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);

  const playing = status.playing;
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  function toggle() {
    if (!uri) return onNeedAudio();
    if (playing) player.pause();
    else {
      void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.play();
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Button
        variant="outline"
        loading={loading}
        onPress={toggle}
        accessibilityLabel={playing ? "Pause recap" : "Play recap"}
        icon={(c) => (playing ? <Pause size={16} color={c} /> : <Play size={16} color={c} />)}
      >
        {loading ? "Recording" : playing ? "Pause" : "Play"}
      </Button>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: "hidden" }} aria-hidden>
        <View style={{ width: `${progress * 100}%`, height: 4, backgroundColor: colors.primary }} />
      </View>
      <Text variant="hint" tone="muted" style={{ fontVariant: ["tabular-nums"], minWidth: 72, textAlign: "right" }}>
        {duration > 0 ? `${formatDuration(status.currentTime)} / ${formatDuration(duration)}` : "0:00"}
      </Text>
    </View>
  );
}
