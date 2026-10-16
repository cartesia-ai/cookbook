export const LIGHT = {
  background: '#f9f9f8',
  foreground: '#1e1c1a',
  card: '#fefefe',
  'card-foreground': '#1e1c1a',
  primary: '#309d4b',
  'primary-foreground': '#fefefe',
  secondary: '#f0efe9',
  muted: '#f3f2ef',
  'muted-foreground': '#787672',
  accent: '#e2f5da',
  'accent-foreground': '#1a6b2e',
  destructive: 'oklch(0.577 0.245 27.325)',
  border: '#e4e3db',
  input: '#e4e3db',
  ring: '#309d4b',
};

export const DARK: typeof LIGHT = {
  background: '#111010',
  foreground: '#f9f9f8',
  card: '#1e1c1a',
  'card-foreground': '#f9f9f8',
  primary: '#5db368',
  'primary-foreground': '#111010',
  secondary: '#2a2826',
  muted: '#1e1c1a',
  'muted-foreground': '#a7a6a2',
  accent: '#1f3a27',
  'accent-foreground': '#abd49e',
  destructive: 'oklch(0.704 0.191 22.216)',
  border: 'color-mix(in oklab, #525150 55%, transparent)',
  input: 'color-mix(in oklab, #525150 70%, transparent)',
  ring: '#5db368',
};

export function cssVars(tokens: typeof LIGHT, prefix = ''): string {
  return Object.entries(tokens)
    .map(([k, v]) => `--${prefix}${k}: ${v};`)
    .join(' ');
}

export const FONT_STACK = `"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
export const MONO_STACK = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
