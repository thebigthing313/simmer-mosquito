<!-- intent-skills:start -->
## Skill loading

Before substantial work:
- Skill check: run `pnpm.cmd dlx @tanstack/intent@latest list` on Windows, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm.cmd dlx @tanstack/intent@latest load <package>#<skill>` on Windows and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

## Windows command resolution

- Prefer `pnpm.cmd ...` instead of `corepack pnpm ...` or bare `pnpm ...` when running commands from automation or Codex. The `.cmd` shim avoids PowerShell/Corepack PATH issues with workspace binaries.
- Prefer direct package binary shims like `node_modules\.bin\biome.CMD ...` when invoking tools directly instead of through a package script.
- Prefer package scripts (`pnpm.cmd run check`, `pnpm.cmd test`, etc.) for normal workspace tasks because pnpm injects `node_modules\.bin` reliably for lifecycle scripts.

## TanStack Router

- Use TanStack Router file-based routing for repo apps that use `@tanstack/react-router`.
- Keep generated `src/routeTree.gen.ts` files committed and do not edit them by hand.
- Configure the TanStack Router Vite plugin with `autoCodeSplitting: true` for Vite apps.

## UI and styling

- Use `packages/ui-web` shadcn source components wherever possible for web UI. Compose existing primitives before writing custom JSX and add missing reusable primitives to `packages/ui-web/src/components/ui`.
- Style with Tailwind semantic tokens and shadcn component variants, not route-local CSS-only implementations. Route-level `className` should mostly describe layout: flex, grid, gap, width, padding, responsive placement, and small one-off composition.
- Do not create CSS classes for ordinary component styling such as cards, rows, badges, panels, forms, tabs, or organization details. Build those surfaces from shadcn primitives and Tailwind classes in the component that owns the markup.
- Put repeated visual decisions in `class-variance-authority` (`cva`) variants inside the shared component, then merge caller-provided classes with the repo `cn` utility from `@simmer-mosquito/ui-web/lib/utils`. If a styling pattern is reused across apps or three or more call sites, promote it to `packages/ui-web`; otherwise keep it as a small app-owned component that composes shadcn primitives with Tailwind.
- Keep durable raw values in `packages/design-tokens`; expose them through Tailwind/CSS variables, then consume them from shadcn components and variants.
- Reserve CSS files for global imports, Tailwind setup, design-token variable exposure, browser resets, vendor integration, or selectors Tailwind cannot express cleanly. Document the reason when adding non-trivial app CSS.
<!-- intent-skills:end -->

## Writing style

Everything you write follows `docs/writing-style.md`: chat replies, commit
messages, PR bodies, changesets, docs, code comments, UI copy. Apply it on every
turn without being asked. The short version is no em dashes, no puffery, no
"not just X but Y", sentence case headings, active voice, plain words, and name
the mechanism instead of the feeling.
