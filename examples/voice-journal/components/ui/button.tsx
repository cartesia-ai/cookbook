import * as React from "react";
import { ActivityIndicator, Platform, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/theme";
import { font, radius } from "../theme/tokens";
import { useFocusVisible } from "./focus";
import { Text } from "./text";

type Variant = "default" | "outline" | "ghost" | "secondary" | "stop";
type Size = "default" | "sm" | "icon" | "icon-sm";

type State = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function Button({
  variant = "default",
  size = "default",
  icon,
  loading,
  children,
  style,
  disabled,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  variant?: Variant;
  size?: Size;
  icon?: (color: string) => React.ReactNode;
  loading?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { focusVisible, onFocus, onBlur } = useFocusVisible();
  const isIcon = size === "icon" || size === "icon-sm";
  const height = size === "sm" || size === "icon-sm" ? 32 : 36;

  const fg =
    variant === "default"
      ? colors.primaryForeground
      : variant === "stop"
        ? colors.destructive
        : variant === "secondary"
          ? colors.secondaryForeground
          : colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      {...props}
      onFocus={(e) => {
        onFocus(e);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        onBlur();
        props.onBlur?.(e);
      }}
      style={(s) => {
        const { pressed, hovered } = s as State;
        const focused = focusVisible;
        const active = pressed || hovered;
        const bg: Record<Variant, string> = {
          default: colors.primary,
          outline: active ? colors.outlineHover : colors.outlineBg,
          ghost: active ? colors.accent : "transparent",
          secondary: colors.secondary,
          stop: colors.destructiveTint,
        };
        return [
          {
            height,
            minWidth: isIcon ? height : undefined,
            width: isIcon ? height : undefined,
            paddingHorizontal: isIcon ? 0 : size === "sm" ? 12 : 16,
            borderRadius: radius.md,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: size === "sm" ? 6 : 8,
            backgroundColor: bg[variant],
            borderWidth: variant === "outline" ? 1 : 0,
            borderColor: colors.input,
            opacity: disabled || loading ? 0.5 : active && (variant === "default" || variant === "secondary" || variant === "stop") ? 0.9 : 1,
            boxShadow: focused
              ? `0 0 0 3px ${colors.ringSoft}`
              : variant === "outline"
                ? "0 1px 2px rgba(0,0,0,0.05)"
                : undefined,
          } as ViewStyle,
          Platform.OS === "web" ? ({ cursor: "pointer", outlineStyle: "none", transitionDuration: "150ms" } as unknown as ViewStyle) : null,
          style,
        ];
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? icon(fg) : null}
      {typeof children === "string" ? (
        <Text weight="medium" style={{ color: fg, fontFamily: font.medium }} numberOfLines={1}>
          {children}
        </Text>
      ) : children ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{children}</View>
      ) : null}
    </Pressable>
  );
}
