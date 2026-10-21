# Cartesia kit

shadcn/ui (MIT, Copyright (c) 2023 shadcn), recolored for Cartesia. The files in `components/ui` are the registry output from the shadcn CLI (style `new-york`, base color `neutral`, Radix, lucide icons, Tailwind v4), and the CSS variables in `theme.css` set the colors. The files in `components/blocks` are written for this kit on top of those components.

Components in `components/ui`: alert, avatar, badge, button, card, checkbox, dialog, input, label, scroll-area, select, separator, skeleton, sonner, tabs, textarea, toggle, toggle-group, tooltip.

Blocks in `components/blocks`: app-shell, choice-chips, empty-state, field, file-dropzone, form-section, steps.

## Theme

`theme.css` holds the whole palette as CSS variables on `:root` and `.dark`. Light is Canvas `#f9f9f8` with Verdant `#309d4b` as `--primary`. Dark is Carbon `#111010` with green-400 `#5db368` as `--primary`. Fonts are Inter only, wired to `--font-sans` with `next/font/google`.

White on Verdant is about 3.4:1, so primary buttons rely on the default `font-medium`. Keep primary text at 14px medium or larger.

## Use in a template

Run these inside the template (a Next.js app with Tailwind v4):

```sh
pnpm dlx shadcn@latest init -b radix
pnpm dlx shadcn@latest add button card badge
```

Then replace the `:root` and `.dark` blocks in `app/globals.css` with the ones from `theme.css` (or copy the file over). In `app/layout.tsx`:

```tsx
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

<html lang="en" className={`${inter.variable} font-sans`}>
```

Templates stay self-contained: copy, do not depend on this package.

## License

Apache-2.0, like the rest of the cookbook. The components in `components/ui` are based on shadcn/ui (MIT). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
