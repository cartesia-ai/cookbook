import { CircleAlert } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { useTheme } from "../theme/theme";
import { radius } from "../theme/tokens";
import { Text } from "./text";

export function Alert({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        gap: 12,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        backgroundColor: colors.card,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <CircleAlert size={16} color={colors.destructive} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="medium" tone="destructive">
          {title}
        </Text>
        {children ? (
          <Text variant="label" style={{ color: colors.destructive, opacity: 0.9 }}>
            {children}
          </Text>
        ) : null}
        {action ? <View style={{ marginTop: 8, flexDirection: "row" }}>{action}</View> : null}
      </View>
    </View>
  );
}
