# Template design rules

Every cookbook template follows these so they look like one product. Copy the blocks from `components/blocks/` into a template's `components/blocks/` and change the imports from `../ui/x` to `@/components/ui/x` and `cn` as the template does.

## Frame

- `AppHeader`: 56px bar, app name only (14px semibold, no logo or mark). Right side: `AppNavLink`s (only if the app has more than one page), then the mode toggle as a ghost `icon-sm` button. Nothing else in the bar.
- `AppMain`: one centered column. `narrow` (672px) for single-task forms, `default` (768px), `wide` (1024px) only for two-pane tools. Gutter 16px on phones, 24px from `sm`.
- `PageHeader` once per page: title 28px semibold (24px on phones), one sentence of description, optional actions on the right.

## Forms

- One task, one `FormPanel`. Split it with `FormSection`s (hairline dividers), not stacked cards. A section has a 14px medium title and an optional 13px muted description; mode switches (Tabs) go in the section's `aside`, top right.
- Every field is a `Field`: 13px label, 8px gap, control, optional 12px hint under it. Two short fields side by side use `FieldGrid` (one column on phones).
- Control height is 36px everywhere: Input, SelectTrigger (`w-full`), Button default. No native `<select>`, `<input type=file>` or checkbox on screen: use Select, `FileDropzone`, Checkbox.
- File inputs are always `FileDropzone`: dashed 144px target, "Choose a file or drag it here", accepted types as the hint; after picking, a one-line row with name, size and remove.
- Presets with several picks use `ChoiceChips` (rounded-full, Verdant tint and a check when on). One-of-a-few uses Tabs as a segmented control.
- The primary action sits in `FormFooter`, right-aligned on desktop, full width on phones, at least 160px wide. One primary (Verdant) button per screen. Secondary actions are `ghost` or `outline`.
- Optional extras hide behind a ghost button with a `Plus` icon, or a "More options" section that starts collapsed.

## Results, progress, lists

- Long jobs show `Steps` (done = filled check, current = spinner, next = hollow ring) in a bordered card under the form.
- Lists are one bordered card with `divide-y` rows (48 to 64px), not a card per item. Row: title 14px medium, meta line 12px muted, trailing actions as ghost icon buttons.
- Empty lists use `EmptyState` (dashed border, 40px muted icon circle, one-line title, one-line hint).
- Errors use the destructive `Alert` with a short title ("Could not finish") and the fixed message.

## Type, color, spacing

- Inter only. Sizes: 28/24 (page title), 14 (body, section titles, buttons), 13 (labels, descriptions), 12 (hints, meta). Weights 400, 500, 600. No uppercase labels, no letter-spaced eyebrows.
- Colors are the tokens in `theme.css` only. Verdant (`primary`) is for the primary button, active chips, focus rings, and links. Surfaces are `background`, `card`, `muted`. No gradients, no shadows beyond `shadow-xs` on panels, no other hues except `destructive`.
- Spacing on a 4px grid: 32px between page header and content, 24px panel padding (20px on phones), 16px between fields, 8px label to control, 40px between page sections.
- Radius: panels `rounded-xl`, controls `rounded-md`, chips `rounded-full`.
- Dark mode must look as finished as light. Check both at 1280px and 390px before you call a screen done.
