import { Check } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../theme/theme";
import { Text } from "../ui/text";

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }} accessibilityLiveRegion="polite" aria-live="polite">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 1,
                alignItems: "center",
                justifyContent: "center",
                borderColor: done ? colors.primary : active ? colors.ringSoft : colors.border,
                backgroundColor: done ? colors.primary : "transparent",
              }}
            >
              {done ? (
                <Check size={12} color={colors.primaryForeground} strokeWidth={2.5} />
              ) : active ? (
                <ActivityIndicator size={12} color={colors.primary} />
              ) : null}
            </View>
            <Text weight={active ? "medium" : "regular"} tone={active ? "default" : "muted"} style={!done && !active ? { opacity: 0.7 } : null}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
