<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `pnpm.cmd dlx @tanstack/intent@latest list` on Windows, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm.cmd dlx @tanstack/intent@latest load <package>#<skill>` on Windows and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

## Windows Command Resolution

- Prefer `pnpm.cmd ...` instead of `corepack pnpm ...` or bare `pnpm ...` when running commands from automation or Codex. The `.cmd` shim avoids PowerShell/Corepack PATH issues with workspace binaries.
- Prefer direct package binary shims like `node_modules\.bin\biome.CMD ...` when invoking tools directly instead of through a package script.
- Prefer package scripts (`pnpm.cmd run check`, `pnpm.cmd test`, etc.) for normal workspace tasks because pnpm injects `node_modules\.bin` reliably for lifecycle scripts.

## TanStack Router

- Use TanStack Router file-based routing for repo apps that use `@tanstack/react-router`.
- Keep generated `src/routeTree.gen.ts` files committed and do not edit them by hand.
- Configure the TanStack Router Vite plugin with `autoCodeSplitting: true` for Vite apps.

## UI and Styling

- Use `packages/ui-web` shadcn source components wherever possible for web UI. Compose existing primitives before writing custom JSX and add missing reusable primitives to `packages/ui-web/src/components/ui`.
- Style with Tailwind semantic tokens and shadcn component variants, not route-local CSS-only implementations. Route-level `className` should mostly describe layout: flex, grid, gap, width, padding, and responsive placement.
- Put repeated visual decisions in `class-variance-authority` (`cva`) variants inside the shared component, then merge caller-provided classes with the repo `cn` utility from `@simmer-mosquito/ui-web/lib/utils`.
- Keep durable raw values in `packages/design-tokens`; expose them through Tailwind/CSS variables, then consume them from shadcn components and variants.
<!-- intent-skills:end -->
