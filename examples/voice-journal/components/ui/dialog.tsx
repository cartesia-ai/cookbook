import * as React from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { useTheme } from "../theme/theme";
import { radius, SM } from "../theme/tokens";
import { Text } from "./text";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= SM;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close"
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <Pressable
          onPress={() => {}}
          accessibilityRole="none"
          style={{
            width: "100%",
            maxWidth: 512,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: 24,
            gap: 16,
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
          }}
        >
          <View style={{ gap: 8, alignItems: wide ? "flex-start" : "center" }}>
            <Text weight="semibold" style={{ fontSize: 18, lineHeight: 24 }} accessibilityRole="header">
              {title}
            </Text>
            {description ? (
              <Text tone="muted" style={{ textAlign: wide ? "left" : "center" }}>
                {description}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: wide ? "row" : "column-reverse", justifyContent: "flex-end", gap: 8 }}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
