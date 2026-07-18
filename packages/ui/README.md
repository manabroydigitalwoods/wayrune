# @wayrune/ui

Shared design system for Wayrune (shadcn/ui + Tailwind v4).

## Theme

- Tokens: `src/styles/globals.css` (teal ramp, soft semantic surfaces, light + `.dark`)
- Runtime: `ThemeProvider` / `useTheme`

## CRM composites (reuse these — do not fork)

| Pattern | Component |
|---------|-----------|
| Create/edit drawer | `RecordSheet` |
| Lists | `DataTable` + `FilterBar` |
| Entity pickers | `EntityCombobox` / `Combobox` |
| Multi-step | `Wizard` |
| Status | `StatusBadge` |
| Confirm | `ConfirmDialog` |
| Icons | `Icon` / `IconButton` / `SoftIcon` |

## Adding a shadcn component

From `packages/ui`:

```bash
npx shadcn@latest add <component> --path src/components/ui
```

Re-export from `src/index.tsx`.
