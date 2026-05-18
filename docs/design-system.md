# SIMMER Design System Architecture

SIMMER uses a centralized design system so visual decisions do not sprawl across
applications as one-off classes, colors, and markup conventions.

## Modules

`packages/design-tokens` is the framework-free visual foundation. It owns raw
visual constants that must work across web, mobile, maps, charts, exports, and
future documents. Its interface is CSS variables plus TypeScript constants for
contexts that cannot consume CSS variables. It must not depend on React, shadcn,
Radix, Expo, or app code.

`packages/ui-web` is the web component system. It uses shadcn-style source
components backed by Radix primitives, Tailwind utilities, and the shared design
tokens. The package owns reusable web component variants, states, composition
rules, and accessibility behavior.

`apps/preview` is the internal living styleguide and design-system workshop. It
is a Vite/TanStack Router app that imports `packages/design-tokens` and
`packages/ui-web` through workspace package boundaries so local package changes
hot-reload during design-system work.

`packages/ui-mobile` is the planned mobile component system. It should consume
the same design-token decisions through a React Native-friendly adapter, but it
does not share web components.

`apps/web` owns route composition, workflow-specific layouts, and screen-level
data wiring. App code may use layout utilities such as flex, grid, gap, width,
and padding, but durable styling decisions should move into tokens or UI
component variants once repeated.

## Centralization Rules

Brand, semantic color, radius, spacing, motion, typography, shadow, and layering
decisions belong in `packages/design-tokens`.

Reusable web controls belong in `packages/ui-web`. Use the local shadcn source
components wherever possible before writing custom styled markup in an app.
If three or more app callers need the same non-layout styling choice, promote
that choice into a `class-variance-authority` (`cva`) component variant instead
of repeating class strings.

Use shadcn components as source code, not as an opaque dependency. Local changes
are expected, but they should deepen the component interface rather than scatter
visual overrides across call sites.

Tailwind is the web styling language. Prefer semantic token utilities such as
`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`,
`border-border`, `bg-primary`, and `text-primary-foreground` over raw color
utilities or CSS literals in route files. Component files should use the shared
`cn` utility to merge base styles, `cva` variants, conditional states, and caller
classes.

App-level `className` should usually describe layout: flex, grid, gap, width,
padding, responsive placement, and local flow. Avoid app-level color, font,
border, radius, shadow, focus, z-index, and animation choices when a token or
component variant can own the decision.

CSS-only custom components are allowed only for genuinely product-specific
patterns that do not map cleanly to a shadcn primitive. Once such a pattern is
reused, move it into `packages/ui-web` with a small public API and variants.

Icons are platform UI, not design tokens. Web frontends must consume icons
through the semantic registry in `packages/ui-web/src/icons/registry.ts` rather
than importing icon libraries directly. `lucide-react` is the default source for
now, with SIMMER-owned assets for the brand mark and mosquito icon. Registry
groups currently cover SIMMER-specific icons, domains, entities, actions,
arrows, and generic UI symbols.

Domain and entity icon decisions should use product language instead of raw
asset names. For example, adult surveillance and mosquito use the SIMMER
mosquito asset, GIS uses the map icon, and biocontrol action uses a fish icon.

## Preview Strategy

SIMMER does not use Storybook as the design-system contract. Visual preview
surfaces live in `apps/preview`, using the real shared stylesheet, router
context, package imports, and Vite HMR against workspace packages.

Preview pages should be small and purposeful: tokens, icons, primitives, forms,
overlays, tables, component kitchen-sink views, prop sandboxes, and workflow
shells. They are aids for design review and visual regression, not a parallel
product application.

## Current Scope

The current design-system surface includes:

- Brand green and yellow scales from 50 through 900 in
  `packages/design-tokens`, with semantic `brand` aliases pointing at the
  canonical scale values.
- CSS variables for brand, surface, border, typography, spacing, radius, motion,
  and preview-workshop tokens.
- `packages/ui-web` shadcn source components consuming shared tokens.
- A semantic icon registry exported from `packages/ui-web`.
- `apps/preview` routes for design tokens, icons, a component kitchen sink, a
  dynamic sandbox, and real-world templates/accessibility stress work.
