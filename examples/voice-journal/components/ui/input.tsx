import * as React from "react";
import { Platform, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { useTheme } from "../theme/theme";
import { font, radius } from "../theme/tokens";

export function Input({ style, leading, ...props }: TextInputProps & { leading?: (color: string) => React.ReactNode }) {
  const { colors } = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <View
      style={{
        height: 36,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: focused ? colors.ring : colors.input,
        borderRadius: radius.md,
        backgroundColor: "transparent",
        paddingHorizontal: 12,
        boxShadow: focused ? `0 0 0 3px ${colors.ringSoft}` : "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {leading ? leading(colors.mutedForeground) : null}
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          { flex: 1, height: 34, fontFamily: font.regular, fontSize: 14, color: colors.foreground, padding: 0 },
          Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as ViewStyle) : null,
          style,
        ]}
      />
    </View>
  );
}
