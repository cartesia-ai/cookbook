import { useRouter } from "expo-router";
import { BookOpen, ChevronRight, Search } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";
import { EmptyState } from "@/components/blocks/empty-state";
import { useTheme } from "@/components/theme/theme";
import { radius } from "@/components/theme/tokens";
import { Input } from "@/components/ui/input";
import { useFocusVisible } from "@/components/ui/focus";
import { Text } from "@/components/ui/text";
import { formatDuration, groupByDay, searchEntries, timeLabel, type Entry } from "@/lib/journal";
import { MOOD_LABELS } from "@/lib/schema";

export const PRIVACY_NOTE =
  "Entries are saved on this device. Recordings go to Cartesia for transcription, and the transcripts go to your LLM provider for titles, moods and reflections.";

export function EntryList({ entries }: { entries: Entry[] }) {
  const [query, setQuery] = React.useState("");
  const groups = React.useMemo(() => groupByDay(searchEntries(entries, query)), [entries, query]);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text weight="medium" accessibilityRole="header" aria-level={2}>
          Entries
        </Text>
        {entries.length ? (
          <Text variant="hint" tone="muted">
            {entries.length}
          </Text>
        ) : null}
      </View>
      {entries.length === 0 ? (
        <EmptyState
          icon={(c) => <BookOpen size={20} color={c} />}
          title="No entries yet"
          description={`Your first recording shows up here. ${PRIVACY_NOTE}`}
        />
      ) : (
        <>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search entries"
            accessibilityLabel="Search entries"
            leading={(c) => <Search size={16} color={c} />}
            returnKeyType="search"
            autoCorrect={false}
          />
          {groups.length === 0 ? (
            <EmptyState icon={(c) => <Search size={20} color={c} />} title="No entries match" description="Try another word from the entry." />
          ) : (
            groups.map((g) => (
              <View key={g.key} style={{ gap: 8 }}>
                <Text variant="label" weight="medium" tone="muted">
                  {g.label}
                </Text>
                <EntryCard entries={g.entries} />
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}

function EntryCard({ entries }: { entries: Entry[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.card, overflow: "hidden" }}>
      {entries.map((e, i) => (
        <EntryRow key={e.id} entry={e} first={i === 0} />
      ))}
    </View>
  );
}

function EntryRow({ entry, first }: { entry: Entry; first: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { focusVisible, onFocus, onBlur } = useFocusVisible();
  const meta = [timeLabel(entry.createdAt), entry.mood ? MOOD_LABELS[entry.mood] : "Needs a title", formatDuration(entry.durationSec)]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${entry.title ?? "Untitled entry"}, ${meta}`}
      onPress={() => router.push({ pathname: "/entry/[id]", params: { id: entry.id } })}
      onFocus={onFocus}
      onBlur={onBlur}
      style={(s) => {
        const { hovered, pressed } = s as { hovered?: boolean; pressed: boolean };
        const focused = focusVisible;
        return [
          {
            minHeight: 60,
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderTopWidth: first ? 0 : 1,
            borderTopColor: colors.border,
            backgroundColor: hovered || pressed ? colors.muted : "transparent",
            boxShadow: focused ? `inset 0 0 0 2px ${colors.ringSoft}` : undefined,
          } as ViewStyle,
          Platform.OS === "web" ? ({ cursor: "pointer", outlineStyle: "none" } as unknown as ViewStyle) : null,
        ];
      }}
    >
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text weight="medium" numberOfLines={1}>
          {entry.title ?? "Untitled entry"}
        </Text>
        <Text variant="hint" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}
