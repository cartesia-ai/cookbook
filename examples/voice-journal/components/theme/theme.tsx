import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { Platform, useColorScheme } from "react-native";
import { dark, light, type Palette } from "./tokens";

type Mode = "system" | "light" | "dark";
type ThemeValue = { colors: Palette; scheme: "light" | "dark"; mode: Mode; toggle: () => void };

const KEY = "voice-journal:theme";
const ThemeContext = React.createContext<ThemeValue>({ colors: light, scheme: "light", mode: "system", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme() === "dark" ? "dark" : "light";
  const [mode, setMode] = React.useState<Mode>("system");

  React.useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === "light" || v === "dark") setMode(v);
      })
      .catch(() => {});
  }, []);

  const scheme = mode === "system" ? system : mode;

  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = (scheme === "dark" ? dark : light).background;
  }, [scheme]);

  const value = React.useMemo<ThemeValue>(
    () => ({
      colors: scheme === "dark" ? dark : light,
      scheme,
      mode,
      toggle: () => {
        const next = scheme === "dark" ? "light" : "dark";
        setMode(next);
        AsyncStorage.setItem(KEY, next).catch(() => {});
      },
    }),
    [scheme, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return React.useContext(ThemeContext);
}
