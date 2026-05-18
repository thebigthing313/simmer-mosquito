# Handoff: Admin Catalog UI and Design System Consolidation

## Current State

- Branch: `staging`
- Latest commit: `0b98503 Add shadcn admin catalog editing`
- Worktree was clean immediately after the commit. `git status` emits a warning about `C:\Users\adria/.config/git/ignore` permission, but no unstaged files were reported.

## What Was Done

- Added a new shared `packages/ui-web` package with shadcn/ui components and styles.
- Updated admin app wiring to consume `@simmer-mosquito/ui-web`.
- Reworked the admin taxonomy page:
  - Handles long species lists with search, genus index, previews, expand/collapse, and internal scrolling.
  - Uses shadcn primitives such as `Button`, `Dialog`, `AlertDialog`, `Field`, `InputGroup`, `ScrollArea`, `Separator`, `Empty`, and `Collapsible`.
  - Adds edit/delete UI for genus and species.
- Reworked the admin units page:
  - Uses shadcn field/form/dialog primitives.
  - Adds edit/delete UI for units.
- Wired mutations through TanStack DB collections:
  - `apps/admin/src/sync/collections.ts` now defines `onUpdate` and `onDelete` for `genera`, `species`, and `units`.
- Added admin API helpers:
  - `updateAdminGenus`, `deleteAdminGenus`
  - `updateAdminSpecies`, `deleteAdminSpecies`
  - `updateAdminUnit`, `deleteAdminUnit`
- Added server endpoints:
  - `PATCH /admin/genera/:genusId`
  - `DELETE /admin/genera/:genusId`
  - `PATCH /admin/species/:speciesId`
  - `DELETE /admin/species/:speciesId`
  - `PATCH /admin/units/:unitId`
  - `DELETE /admin/units/:unitId`
- Added db helpers in `packages/db/src/index.ts` for update/delete with txid wrappers.

## Verification Already Run

- `pnpm.cmd --filter @simmer-mosquito/db typecheck`
- `pnpm.cmd --filter @simmer-mosquito/admin typecheck`
- `pnpm.cmd --filter @simmer-mosquito/server typecheck`
- `node_modules\.bin\biome.CMD check ...`
- `pnpm.cmd --filter @simmer-mosquito/db build`
- `pnpm.cmd --filter @simmer-mosquito/admin build`
- `pnpm.cmd --filter @simmer-mosquito/server build`

Admin build still reports the existing Vite large chunk warning.

## User Concern

The user is concerned about a design-stack split: bespoke route CSS and Tailwind/shadcn styling both making design decisions. I recommended consolidating around:

- `packages/ui-web` for reusable shadcn components.
- Tailwind classes for local layout composition.
- CSS variables for tokens.
- Plain CSS only for global shell, tokens, and exceptional page topology.

## Suggested Next Session Focus

Consolidate the design system so admin UI work does not keep drifting between CSS components and shadcn/Tailwind components.

Recommended first PR:

- Move SIMMER token alignment into `packages/ui-web/src/styles.css`.
- Refactor `Panel` to full shadcn `Card` composition.
- Add shared admin primitives:
  - `DeleteConfirmDialog`
  - `EditDialog` or entity-specific dialog wrapper
  - `RecordActions`
  - `RecordRow`
  - `CatalogBrowserLayout`
- Use those in taxonomy and units.
- Delete now-unused route-level CSS from `apps/admin/src/styles.css`.

## Suggested Skills

- `shadcn`: for component composition and avoiding custom markup where shadcn primitives exist.
- `impeccable`: for layout and product-surface quality.
- `improve-codebase-architecture`: if the session expands into a broader component-boundary refactor.

## Important Notes

- The user explicitly asked that edit/delete mutations be wired through collections. Preserve that approach.
- Avoid side-channel fetches from route components for taxonomy/unit mutations.
- There are many existing broad admin UI changes in the latest commit because the user asked to commit all changes.
- `mktemp` was unavailable in PowerShell, so this handoff was saved to a workspace-local path instead of a true `mktemp -t` path.
