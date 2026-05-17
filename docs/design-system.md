# SIMMER Design System Architecture

SIMMER uses a centralized design system so visual decisions do not sprawl across
applications as one-off classes, colors, and markup conventions.

## Modules

`packages/design-tokens` is the framework-free visual foundation. It owns raw
visual constants that must work across web, mobile, maps, charts, exports, and
future documents. Its interface is CSS variables plus TypeScript constants for
contexts that cannot consume CSS variables. It must not depend on React, shadcn,
Radix, Expo, or app code.

`packages/ui-web` is the planned web component system. It should use
shadcn-style source components backed by Radix primitives, Tailwind utilities,
and the shared design tokens. The package owns reusable web component variants,
states, composition rules, and accessibility behavior.

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

Reusable web controls belong in `packages/ui-web`. If three or more app
callers need the same non-layout styling choice, promote that choice into a
component variant instead of repeating class strings.

Use shadcn components as source code, not as an opaque dependency. Local changes
are expected, but they should deepen the component interface rather than scatter
visual overrides across call sites.

App-level `className` should usually describe layout. Avoid app-level color,
font, border, radius, shadow, focus, z-index, and animation choices when a token
or component variant can own the decision.

Icons are platform UI, not design tokens. A semantic icon registry can live in
`packages/ui-web` once repeated web usage justifies it.

## Preview Strategy

SIMMER does not use Storybook as the design-system contract. When visual preview
surfaces are useful, add lightweight development-only preview routes inside
`apps/web`, using the real app stylesheet, router context, and package imports.

Preview pages should be small and purposeful: tokens, primitives, forms,
overlays, tables, and workflow shells. They are aids for design review, not a
second application to maintain.

## Current Scope

The rebuild starts with only SIMMER brand colors in
`packages/design-tokens`. Additional tokens, palettes, and UI components should
be added when real product surfaces need them.
