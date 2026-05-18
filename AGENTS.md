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
<!-- intent-skills:end -->
