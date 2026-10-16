import * as React from "react";
import { View } from "react-native";
import { useTheme } from "../theme/theme";
import { radius } from "../theme/tokens";
import { Text } from "./text";

export function Badge({ children, tone = "outline" }: { children: React.ReactNode; tone?: "outline" | "accent" }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        height: 22,
        paddingHorizontal: 8,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: tone === "accent" ? colors.accent : colors.border,
        backgroundColor: tone === "accent" ? colors.accent : "transparent",
      }}
    >
      <Text variant="hint" weight="medium" tone={tone === "accent" ? "accent" : "default"}>
        {children}
      </Text>
    </View>
  );
}
