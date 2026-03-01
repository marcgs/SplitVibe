---
applyTo: "**/*.tsx"
---

# React Component Conventions

- Default to Server Components (async functions, no directive). Add `"use client"` only when state or browser APIs are needed.
- Export components as `export default function ComponentName()`.
- Type props with an interface named `ComponentNameProps`.
- Destructure props in the function signature.
- Use shadcn/ui components from `components/ui/` where available.
- Tailwind palette: zinc for neutrals, white/black for backgrounds. Always include dark mode variants (`dark:bg-zinc-900`, `dark:text-zinc-100`).
- Form inputs: `rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100`.
- Buttons: `rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50`.
- Consistent spacing: `gap-3`/`gap-4` for flex/grid, `space-y-3`/`space-y-4` for stacked layouts.
