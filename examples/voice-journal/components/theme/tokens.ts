export type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveTint: string;
  border: string;
  input: string;
  ring: string;
  ringSoft: string;
  headerBg: string;
  outlineBg: string;
  outlineHover: string;
  track: string;
};

export const light: Palette = {
  background: "#f9f9f8",
  foreground: "#1e1c1a",
  card: "#fefefe",
  cardForeground: "#1e1c1a",
  popover: "#fefefe",
  primary: "#309d4b",
  primaryForeground: "#fefefe",
  secondary: "#f0efe9",
  secondaryForeground: "#1e1c1a",
  muted: "#f3f2ef",
  mutedForeground: "#787672",
  accent: "#e2f5da",
  accentForeground: "#1a6b2e",
  destructive: "#e7000b", // oklch(0.577 0.245 27.325)
  destructiveTint: "rgba(231, 0, 11, 0.08)",
  border: "#e4e3db",
  input: "#e4e3db",
  ring: "#309d4b",
  ringSoft: "rgba(48, 157, 75, 0.5)",
  headerBg: "rgba(249, 249, 248, 0.85)",
  outlineBg: "#f9f9f8",
  outlineHover: "#e2f5da",
  track: "#f3f2ef",
};

export const dark: Palette = {
  background: "#111010",
  foreground: "#f9f9f8",
  card: "#1e1c1a",
  cardForeground: "#f9f9f8",
  popover: "#1e1c1a",
  primary: "#5db368",
  primaryForeground: "#111010",
  secondary: "#2a2826",
  secondaryForeground: "#f9f9f8",
  muted: "#1e1c1a",
  mutedForeground: "#a7a6a2",
  accent: "#1f3a27",
  accentForeground: "#abd49e",
  destructive: "#ff6467", // oklch(0.704 0.191 22.216)
  destructiveTint: "rgba(255, 100, 103, 0.12)",
  border: "rgba(82, 81, 80, 0.55)", // #525150 at 55%
  input: "rgba(82, 81, 80, 0.7)",
  ring: "#5db368",
  ringSoft: "rgba(93, 179, 104, 0.5)",
  headerBg: "rgba(17, 16, 16, 0.85)",
  outlineBg: "rgba(82, 81, 80, 0.21)",
  outlineHover: "rgba(82, 81, 80, 0.35)",
  track: "#2a2826",
};

export const radius = { sm: 6, md: 8, lg: 10, xl: 14, full: 999 } as const;

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
} as const;

export const type = {
  title: { fontSize: 28, lineHeight: 36 },
  titlePhone: { fontSize: 24, lineHeight: 32 },
  body: { fontSize: 14, lineHeight: 20 },
  bodyLoose: { fontSize: 14, lineHeight: 24 },
  label: { fontSize: 13, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 16 },
} as const;

export const SM = 640;
