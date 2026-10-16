import { Check, ChevronDown } from "lucide-react-native";
import * as React from "react";
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useTheme } from "../theme/theme";
import { radius } from "../theme/tokens";
import { useFocusVisible } from "./focus";
import { Text } from "./text";

export type SelectOption = { value: string; label: string; hint?: string };

export function Select({
  value,
  options,
  onValueChange,
  placeholder = "Select",
  disabled,
  accessibilityLabel,
}: {
  value: string;
  options: SelectOption[];
  onValueChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const { focusVisible, onFocus, onBlur } = useFocusVisible();
  const trigger = React.useRef<React.ComponentRef<typeof Pressable>>(null);
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState({ x: 0, y: 0, w: 0, h: 0 });
  const { height: winH } = useWindowDimensions();
  const current = options.find((o) => o.value === value);

  function show() {
    trigger.current?.measureInWindow((x, y, w, h) => {
      setRect({ x, y, w, h });
      setOpen(true);
    });
  }

  const listH = Math.min(288, options.length * 40 + 8);
  const below = rect.y + rect.h + 4 + listH < winH - 8;
  const top = below ? rect.y + rect.h + 4 : Math.max(8, rect.y - 4 - listH);

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="combobox"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={show}
        onFocus={onFocus}
        onBlur={onBlur}
        style={() => {
          const focused = focusVisible || open;
          return [
            {
              height: 36,
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: focused ? colors.ring : colors.input,
              borderRadius: radius.md,
              opacity: disabled ? 0.5 : 1,
              boxShadow: focused ? `0 0 0 3px ${colors.ringSoft}` : "0 1px 2px rgba(0,0,0,0.05)",
            } as ViewStyle,
            Platform.OS === "web" ? ({ cursor: "pointer", outlineStyle: "none" } as unknown as ViewStyle) : null,
          ];
        }}
      >
        <Text numberOfLines={1} tone={current ? "default" : "muted"} style={{ flex: 1 }}>
          {current ? current.label : placeholder}
          {current?.hint ? <Text tone="muted">{`  ${current.hint}`}</Text> : null}
        </Text>
        <ChevronDown size={16} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <View
            style={{
              position: "absolute",
              left: rect.x,
              top,
              width: rect.w,
              maxHeight: listH,
              backgroundColor: colors.popover,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
              overflow: "hidden",
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 4 }} accessibilityRole="list">
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      onValueChange(o.value);
                      setOpen(false);
                    }}
                    style={(s) => {
                      const hl = s.pressed || (s as { hovered?: boolean }).hovered;
                      return [
                        {
                          minHeight: 32,
                          paddingVertical: 6,
                          paddingLeft: 8,
                          paddingRight: 32,
                          borderRadius: radius.sm,
                          justifyContent: "center",
                          backgroundColor: hl ? colors.accent : "transparent",
                        } as ViewStyle,
                        Platform.OS === "web" ? ({ cursor: "pointer" } as unknown as ViewStyle) : null,
                      ];
                    }}
                  >
                    <Text numberOfLines={1}>
                      {o.label}
                      {o.hint ? <Text tone="muted">{`  ${o.hint}`}</Text> : null}
                    </Text>
                    {on ? <Check size={16} color={colors.foreground} style={{ position: "absolute", right: 8 }} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
