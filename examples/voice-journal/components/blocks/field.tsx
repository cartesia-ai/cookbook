import * as React from "react";
import { View } from "react-native";
import { Text } from "../ui/text";

export function Field({ label, hint, error, children }: { label?: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8, minWidth: 0 }}>
      {label ? (
        <Text variant="label" weight="medium" style={{ lineHeight: 14 }}>
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="hint" tone="destructive">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="hint" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
