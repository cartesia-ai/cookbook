import * as React from "react";
import { View, useWindowDimensions } from "react-native";
import { useTheme } from "../theme/theme";
import { radius, SM } from "../theme/tokens";
import { Text } from "../ui/text";

export function FormPanel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.xl,
        backgroundColor: colors.card,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

function usePad() {
  const { width } = useWindowDimensions();
  return width >= SM ? 24 : 20;
}

export function FormSection({
  title,
  description,
  aside,
  children,
}: {
  title?: string;
  description?: string;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const pad = usePad();
  return (
    <View style={{ padding: pad, gap: 16 }}>
      {title || aside ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            {title ? (
              <Text weight="medium" accessibilityRole="header" aria-level={2}>
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text variant="label" tone="muted">
                {description}
              </Text>
            ) : null}
          </View>
          {aside}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function FormFooter({ children }: { children: React.ReactNode }) {
  const pad = usePad();
  const { width } = useWindowDimensions();
  const wide = width >= SM;
  return (
    <View
      style={{
        padding: pad,
        gap: 8,
        flexDirection: wide ? "row" : "column-reverse",
        alignItems: wide ? "center" : "stretch",
        justifyContent: "flex-end",
      }}
    >
      {children}
    </View>
  );
}
