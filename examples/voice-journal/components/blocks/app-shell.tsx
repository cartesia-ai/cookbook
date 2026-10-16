import { Link, useRouter } from "expo-router";
import { Moon, Sun } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/theme";
import { radius, SM, type } from "../theme/tokens";
import { Button } from "../ui/button";
import { useFocusVisible } from "../ui/focus";
import { Text } from "../ui/text";

const widths = { narrow: 672, default: 768, wide: 1024 } as const;
type Width = keyof typeof widths;

function useGutter() {
  const { width } = useWindowDimensions();
  return width >= SM ? 24 : 16;
}

export function AppHeader({ name, width = "default", children }: { name: string; width?: Width; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const gutter = useGutter();
  return (
    <View
      style={[
        {
          paddingTop: insets.top,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.headerBg,
          zIndex: 40,
        },
        Platform.OS === "web" ? ({ backdropFilter: "blur(8px)" } as unknown as ViewStyle) : null,
      ]}
    >
      <View
        style={{
          height: 56,
          width: "100%",
          maxWidth: widths[width],
          alignSelf: "center",
          paddingHorizontal: gutter,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Link href="/" accessibilityRole="link">
          <Text weight="semibold" style={{ letterSpacing: -0.2 }}>
            {name}
          </Text>
        </Link>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityRole="menubar">
          {children}
        </View>
      </View>
    </View>
  );
}

export function AppNavLink({ href, active, children }: { href: "/" | "/recap"; active?: boolean; children: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [hovered, setHovered] = React.useState(false);
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  return (
    <Pressable
      accessibilityRole="link"
      aria-current={active ? "page" : undefined}
      {...(Platform.OS === "web" ? ({ href } as object) : null)}
      onPress={(e) => {
        e.preventDefault?.();
        if (!active) router.navigate(href);
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={onFocus}
      onBlur={onBlur}
      style={[
        {
          height: 32,
          paddingHorizontal: 12,
          borderRadius: radius.md,
          justifyContent: "center",
          backgroundColor: active ? colors.muted : "transparent",
          boxShadow: focused ? `0 0 0 3px ${colors.ringSoft}` : undefined,
        } as ViewStyle,
        Platform.OS === "web" ? ({ outlineStyle: "none", cursor: "pointer", textDecorationLine: "none" } as unknown as ViewStyle) : null,
      ]}
    >
      <Text weight="medium" style={{ color: active || hovered ? colors.foreground : colors.mutedForeground }}>
        {children}
      </Text>
    </Pressable>
  );
}

export function ModeToggle() {
  const { scheme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      accessibilityLabel={scheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onPress={toggle}
      icon={(c) => (scheme === "dark" ? <Moon size={16} color={c} /> : <Sun size={16} color={c} />)}
    />
  );
}

export function AppMain({ width = "default", children }: { width?: Width; children: React.ReactNode }) {
  const { width: w } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = w >= SM ? 24 : 16;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View
        accessibilityRole="main"
        style={{
          width: "100%",
          maxWidth: widths[width],
          alignSelf: "center",
          paddingHorizontal: gutter,
          paddingTop: w >= SM ? 56 : 40,
          paddingBottom: 80 + insets.bottom,
        }}
      >
        {children}
      </View>
    </ScrollView>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= SM;
  return (
    <View
      style={{
        marginBottom: 32,
        gap: 16,
        flexDirection: wide ? "row" : "column",
        alignItems: wide ? "flex-end" : "stretch",
        justifyContent: "space-between",
      }}
    >
      <View style={{ gap: 6, flexShrink: 1 }}>
        <Text accessibilityRole="header" aria-level={1} weight="semibold" style={[wide ? type.title : type.titlePhone, { letterSpacing: -0.4 }]}>
          {title}
        </Text>
        {description ? (
          <Text tone="muted" style={[type.bodyLoose, { maxWidth: 560 }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{actions}</View> : null}
    </View>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
}
