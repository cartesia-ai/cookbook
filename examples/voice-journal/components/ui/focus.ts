import * as React from "react";
import { Platform } from "react-native";

export function useFocusVisible() {
  const [visible, setVisible] = React.useState(false);
  const onFocus = React.useCallback((e: unknown) => {
    if (Platform.OS !== "web") return setVisible(true);
    const t = (e as { target?: { matches?: (s: string) => boolean } })?.target;
    setVisible(Boolean(t?.matches?.(":focus-visible")));
  }, []);
  const onBlur = React.useCallback(() => setVisible(false), []);
  return { focusVisible: visible, onFocus, onBlur };
}
