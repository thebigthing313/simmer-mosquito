# @simmer-mosquito/design-tokens

Shared visual constants for SIMMER. This package is intentionally framework-free:
CSS variables for stylesheets, and TypeScript constants for places that cannot
consume CSS variables.

Current surface:

- `src/tokens.css`: SIMMER brand color CSS variables and Tailwind v4 theme
  mappings.
- `src/colors.ts`: matching brand color hex values for JavaScript consumers.

Do not add React components, icons, or shadcn component code here. Those belong
in platform-specific UI packages.
