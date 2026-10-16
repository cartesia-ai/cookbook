import * as React from "react";
import { View } from "react-native";
import { useTheme } from "../theme/theme";
import { radius } from "../theme/tokens";
import { Text } from "../ui/text";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: (color: string) => React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.border,
        borderRadius: radius.xl,
        paddingHorizontal: 24,
        paddingVertical: 48,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: scheme === "dark" ? colors.secondary : colors.muted,
          }}
        >
          {icon(colors.mutedForeground)}
        </View>
      ) : null}
      <View style={{ gap: 4, alignItems: "center" }}>
        <Text weight="medium" style={{ textAlign: "center" }}>
          {title}
        </Text>
        {description ? (
          <Text variant="label" tone="muted" style={{ textAlign: "center", maxWidth: 360 }}>
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
