# @simmer-mosquito/design-tokens

Shared visual constants for SIMMER. This package is intentionally framework-free:
CSS variables for stylesheets, and TypeScript constants for places that cannot
consume CSS variables.

Current surface:

- `src/tokens.css`: SIMMER brand, semantic surface, typography, spacing,
  radius, motion, and Tailwind v4 theme variable mappings.
- `src/colors.ts`: matching brand color values for JavaScript consumers,
  including brand green and brand yellow scales from 50 through 900 plus
  semantic `brand` aliases.

Do not add React components, icons, or shadcn component code here. Those belong
in platform-specific UI packages.

Brand color aliases should dedupe through the scale values. For example,
`brand.green` should point at the canonical green ramp value rather than owning a
separate hard-coded SIMMER green. App and component code should prefer semantic
CSS variables; use the TypeScript constants only where CSS variables are not
available.
