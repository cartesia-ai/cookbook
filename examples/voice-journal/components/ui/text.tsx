import * as React from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "../theme/theme";
import { font, type } from "../theme/tokens";

type Variant = keyof typeof type;
type Weight = keyof typeof font;
type Tone = "default" | "muted" | "primary" | "destructive" | "accent";

export function Text({
  variant = "body",
  weight = "regular",
  tone = "default",
  style,
  ...props
}: TextProps & { variant?: Variant; weight?: Weight; tone?: Tone }) {
  const { colors } = useTheme();
  const color =
    tone === "muted"
      ? colors.mutedForeground
      : tone === "primary"
        ? colors.primary
        : tone === "destructive"
          ? colors.destructive
          : tone === "accent"
            ? colors.accentForeground
            : colors.foreground;
  const base: TextStyle = { fontFamily: font[weight], color, ...type[variant] };
  return <RNText {...props} style={[base, style]} />;
}
