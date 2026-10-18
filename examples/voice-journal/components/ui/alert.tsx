import { CircleAlert, Info } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { useTheme } from "../theme/theme";
import { radius } from "../theme/tokens";
import { Text } from "./text";

export function Alert({
  title,
  children,
  action,
  variant = "default",
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "default" | "destructive";
}) {
  const { colors } = useTheme();
  const destructive = variant === "destructive";
  const Icon = destructive ? CircleAlert : Info;
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
      <Icon size={16} color={destructive ? colors.destructive : colors.foreground} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="medium" tone={destructive ? "destructive" : "default"}>
          {title}
        </Text>
        {children ? (
          <Text variant="label" style={destructive ? { color: colors.destructive, opacity: 0.9 } : { color: colors.mutedForeground }}>
            {children}
          </Text>
        ) : null}
        {action ? <View style={{ marginTop: 8, flexDirection: "row" }}>{action}</View> : null}
      </View>
    </View>
  );
}
