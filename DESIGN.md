---
name: SIMMER
description: Map-centric mosquito control operations UI for focused agency work.
colors:
  field-green: "oklch(52.71% 0.1114 159.1429)"
  deep-field-green: "oklch(39.15% 0.0882 156.38)"
  root-green: "oklch(31.82% 0.0732 156.0959)"
  pollen-yellow: "oklch(96.23% 0.052 108.52)"
  deep-pollen: "oklch(57.8% 0.113 94)"
  bright-pollen: "oklch(85.8% 0.119 104)"
  survey-purple: "oklch(49.37% 0.1424 325.97)"
  alert-red: "oklch(61.56% 0.2307 16.37)"
  destructive: "oklch(54% 0.2 17)"
  operations-blue: "oklch(44.83% 0.1791 268.37)"
  app-bg: "oklch(97.8% 0.0153 157.1)"
  app-stage: "oklch(96.4% 0.006 185)"
  surface: "oklch(99% 0.004 165)"
  surface-muted: "oklch(93.8% 0.0253 157.8)"
  surface-strong: "oklch(88.2% 0.0349 158.7)"
  border: "oklch(78.5% 0.0266 181.6)"
  border-strong: "oklch(61.9% 0.0491 172.4)"
  text: "oklch(24% 0.025 205)"
  muted: "oklch(48% 0.028 205)"
  quiet: "oklch(51% 0.024 205)"
  attention: "oklch(85.8% 0.119 104)"
  warning: "oklch(45% 0.09 55)"
typography:
  display:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 4vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "normal"
  headline:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.76rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.deep-field-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.deep-field-green}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "clamp(20px, 4vw, 30px)"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "9px 11px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  field-error:
    textColor: "{colors.destructive}"
    typography: "{typography.label}"
  page-container:
    backgroundColor: "{colors.app-stage}"
    padding: "24px 16px"
    width: "1200px"
  sticky-header:
    backgroundColor: "{colors.app-bg}"
    textColor: "{colors.text}"
    padding: "16px"
---

# Design system: SIMMER

## 1. Overview

**Creative direction: "The Field Operations Map Room"**

SIMMER should feel like a calm operational workspace built around geography:
professional, natural, and focused. It is not a marketing surface and not a
generic admin console. It is where agency and SIMMER Operator work becomes
legible enough to trust.

The product register is restrained, but not bland. Use tinted neutrals, grounded
green, and earned yellow attention to keep dense workflows readable. The
interface should feel field-aware through language, structure, map adjacency,
and record relationships, not through decorative nature motifs.

The system explicitly rejects generic government portal design, enterprise GIS
clone density, dashboard theater, consumer map mimicry, and table-first data
representation. When in doubt, make the next operational action clearer.

**Key Characteristics:**
- Map-first operational clarity.
- Restrained product surfaces with warm field cues.
- Compact hierarchy for repeated work.
- Visual representations before tables when location, time, status, or
  relationships explain the work better.
- Durable tokens in `packages/design-tokens`, shadcn source components in
  `packages/ui-web`, `cva` variants for repeated styles, then route-level
  styling only as a last resort.

## 2. Colors

The palette is a restrained product system: green carries trust and action,
yellow marks lightweight attention, and blue-green neutrals keep surfaces close
to maps and field records without becoming decorative.

### Primary
- **Field Green**: Primary brand and action color. Use for committed actions,
  active selection, confirmed operational state, and stable brand anchoring.
- **Deep Field Green**: Current admin action color. Use for primary buttons,
  selected navigation emphasis, and high-confidence control plane actions.
- **Root Green**: Deep brand anchor for rare moments that need more gravity
  than the default primary.

### Secondary
- **Pollen Yellow**: Gentle attention color. Use for selected spatial context,
  warning-adjacent surfaces that are not errors and lightweight emphasis. It
  fills surfaces; it does not stroke focus rings. See Deep Pollen.
- **Deep Pollen**: The focus-ring yellow. Bright Pollen Yellow only reaches
  1.6:1 against our pale surfaces, so focus drawn in it is invisible on light
  controls. Deep Pollen is the same hue family carried far enough down the ramp
  to clear 3:1 on every surface a ring can land on. On dark chrome (the primary
  rail) invert to the bright end instead, where the contrast runs the other way.

### Tertiary
- **Operations Blue**: Reserved for informational or sync-oriented product
  states when green would imply success.
- **Survey Purple**: Reserved for taxonomy, analysis, or categorical accents
  when a distinct non-status color is required.
- **Alert Red**: Error and destructive-state color only. Note the brand constant
  and the semantic `destructive` token are no longer the same value. Brand Alert
  Red is tuned for fills and map marks; as 14px error copy it only reaches
  4.07:1, so `destructive` sits a shade darker to clear AA both as text and
  under white on a filled button. Reach for the semantic token in UI; reserve
  the brand constant for brand contexts.

### Neutral
- **App Background**: The page field behind product surfaces.
- **Surface**: Default panel, drawer, input, and topbar surface.
- **Surface Muted**: Sidebar, fact tiles, compact rows, and quiet grouped
  containers.
- **Surface Strong**: Denser tonal separation when muted is not enough.
- **Border / Border Strong**: Two different jobs, not two weights of one job.
  Border is a decorative divider. Border Strong draws the boundary of a form
  control, which makes it a UI component under WCAG and puts it on a 3:1 floor.
- **Text / Muted / Quiet**: Primary copy, supporting copy, and metadata labels.
  Be aware there is almost no room left between Muted and Quiet at AA: a third
  *lighter* tier cannot really exist on surfaces this pale. Separate quiet
  metadata by size, weight, or position instead of by going lighter.
- **Attention / Warning**: Attention surface tint and warning text treatment.
  Attention is a fill, not the focus ring; the two were aliased until the ring
  had to darken for contrast.

### Named rules

**The Earned Color Rule.** Every non-neutral color must carry a semantic job:
action, status, selection, focus, taxonomy, sync, or spatial meaning.

**The Map-Room Neutral Rule.** Neutral surfaces are tinted toward green and blue.
Never use pure black or pure white.

**The No Decoration Rule.** Product screens use color to clarify work, not to
fill empty space.

**The State Colour Rule.** A colour that only appears under a *condition*, such
as focus, error, invalid, inactive, or selected, is the one that will ship broken.
Base colours get looked at constantly; state colours have to be triggered to be
seen at all, so visual review never catches them. Every one of SIMMER's contrast
failures lived here while body copy sat comfortably at 15:1. Prove state colours
with a number, not an eye: `packages/ui-web/src/tests/unit/styles.contrast.test.ts` reads
the real stylesheets and fails the build on a regression.

**The Registered Token Rule.** A colour role is only usable if Tailwind knows
about it. `--success`, `--warning`, `--attention`, `--info`, `--catalog`,
`--danger`, and `--quiet` lived in `:root` for a long time without matching
`--color-*` entries in `@theme`, which meant `text-warning` compiled to *nothing
at all*: no error, no fallback, just uncoloured text that looked deliberate in
review. A stray `text-warning` in `apps/web/src/routes/-components.tsx` was inert
for exactly this reason, and the `text-[var(--success)]` spellings elsewhere were
people routing around the omission without naming it.

They are registered now, so the short form works. When a new role joins the
palette, it goes in **both** places, and the check is empirical: build, then grep
the emitted CSS for the class. A utility that generates no rule is invisible in
the source and invisible on screen.

**The Solid Indicator Rule.** A focus ring is never drawn at partial alpha. An
alpha ring composites toward the surface it is supposed to contrast against, so
it gets *less* visible exactly where it needs to be more. SIMMER's ring sat at
1.24:1 for months for this reason. Ring colours are opaque, always.

## 3. Typography

**Display Font:** Poppins with system sans fallback
**Body Font:** Poppins with system sans fallback
**Label/Mono Font:** Poppins for labels; a mono stack only for IDs,
coordinates, codes, and technical values.

**Character:** Poppins should make SIMMER feel approachable without softening
dense operational UI. Use it with compact hierarchy, normal letter spacing, and
strong weight contrast.

### Hierarchy
- **Display** (700, clamp(1.8rem, 4vw, 2.6rem), 1.1): Rare onboarding,
  empty-state, or route-level moments.
- **Headline** (700, 1.45rem, 1.2): Page headings and workflow section leads.
- **Title** (700, 1.1rem, 1.25): Panels, drawers, record groups, and dialogs.
- **Body** (400, 1rem, 1.55): Explanatory copy, record summaries, and readable
  prose. Cap line length at 65-75ch.
- **Label** (800, 0.76rem, uppercase only when it improves scanning): Eyebrows,
  metadata labels, sidebar headings, table headers, and sync labels.

### Named rules

**The Poppins Rule.** Poppins is the intended SIMMER sans serif. Replace current
Inter/system stacks as product surfaces are touched.

**The Product Type Rule.** Typography must help users scan and act. Do not use
display styling in labels, buttons, tables, forms, or dense controls.

## 4. Elevation

SIMMER is flat by default. Depth comes from tonal layering, borders, spatial
placement, and drawer geometry. Shadows are allowed only when a surface truly
floats above the current task, such as a drawer, popover, menu, or map control.

### Shadow vocabulary

- **Legacy Ambient Panel** (`0 10px 30px rgb(24 38 50 / 8%)`): Existing web
  shell panel shadow. Do not expand this as a default pattern.
- **Backdrop Scrim** (`oklch(24% 0.025 205 / 35%)`): Modal drawer backdrop for
  committed interruption.

### Stacking order

Depth is a three-rung ladder, not a set of arbitrary numbers. Everything in the
app already sits on one of these; keep it that way rather than inventing a new
value to win a specific fight.

- **Base (no z-index).** Ordinary page content.
- **`z-10`, pinned within a scroll container.** Sticky panel headers, map
  overlays and legends, floating map controls. These outrank the content they
  scroll over and nothing else.
- **`z-50`, the overlay tier.** Dialogs, drawers, popovers, dropdowns, tooltips,
  toasts, and the skip link. Owned by the `ui-web` primitives; app code should
  rarely write it directly.

A pinned header must never paint over an open menu, which is the whole reason
the pinned rung sits below the overlay rung. If something needs to escape a
clipping ancestor, the fix is a portal, not a higher number.

### Named rules

**The Flat Until Floating Rule.** Resting surfaces are flat. Floating surfaces
must earn depth by interrupting, overlaying, or anchoring to a map/task context.

## 5. Components

Components should feel compact, durable, and operational. A user should be able
to scan a screen repeatedly without fighting decorative chrome.

### Implementation contract

Web product UI must start from the shadcn source components in
`packages/ui-web/src/components/ui` wherever a fitting primitive exists. Compose
Button, Card, Field, Input, Select, Dialog, Sheet, Drawer, Tabs, Table, Badge,
Empty, Alert, Separator, Skeleton, Sidebar, and related primitives before
building a styled element from scratch.

Tailwind is the styling language for web UI. Use semantic tokens such as
`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`,
`border-border`, `bg-primary`, and `text-primary-foreground` rather than raw
colors or one-off CSS values in app routes.

Reusable styling choices belong in `class-variance-authority` (`cva`) variants
inside the shared component. Use the repo `cn` utility to merge variants,
conditional classes, and caller `className` values. Route-level classes should
mostly express layout, spacing, width, responsive behavior, and local placement.

CSS-only custom components are a last resort. Use them only when the shape is
truly product-specific, has no useful shadcn primitive, and is not likely to be
reused. If a custom pattern appears more than once, promote it into
`packages/ui-web`.

### Buttons
- **Shape:** Gently curved rectangles (8px radius).
- **Primary:** Deep Field Green background, light surface text, 40px height, and
  16px horizontal padding. Use once per local workflow when possible.
- **Hover / Focus:** Hover deepens the green. Focus uses a solid Deep Pollen ring,
  never a translucent one. A ring at partial alpha composites toward whatever
  is behind it, which is exactly the surface it needs to contrast against.
- **Secondary / Subtle:** White or muted surface background with green or muted
  text. Use for navigation, row actions, and cancellation-like commands.
  Implement these as `Button` variants in `packages/ui-web`, not repeated button
  class strings in routes.

### Chips
- **Style:** Not formalized yet. Start from compact bordered pills on muted
  surface, with status conveyed by text or icon plus color.
- **State:** Selected, filter, status, and map-layer meanings must be visually
  distinct without relying on color alone.

### Cards / containers
- **Corner Style:** Gently curved (8px radius) for panels, fact tiles, sidebars,
  forms, and rows.
- **Background:** Surface for primary panels; Surface Muted for sidebars, fact
  tiles, and compact groupings.
- **Shadow Strategy:** Follow the Flat Until Floating Rule.
- **Border:** One-pixel structural border only. Colored side stripes are
  forbidden.
- **Internal Padding:** 16px for compact groups; clamp(20px, 4vw, 30px) for
  panels.

### Page container

Every non-map route page sits in one measure: a centred 1200px column on the
App Stage surface. This is a `cva` in `packages/ui-web/src/components/page-container.tsx`
with two axes: `gap` (how far apart stacked sections sit) and `padding` (framed
page, record detail with bottom room, or trailing-only when a parent already
pads). A `flow` axis switches between the section grid and a plain block column.

The variants are not invented; they are the shapes ~20 route files had already
converged on as literal class strings. The measure is decided there and nowhere
else. A route that re-states `max-w-[1200px]` has taken a decision that isn't
its to make.

### Sticky panel header

The pinned bar at the top of a scrolling panel: explorer rails, form sheets,
result lists. Opaque surface, one-pixel bottom border, `z-10`.

**The Opaque Pin Rule.** A sticky header is fully opaque. It was
`bg-background/95` behind a `backdrop-blur` in ~32 places: a blur behind a
95%-opaque surface has nothing to resolve, so it bought a compositing layer on
every scroll for an effect nobody could see. Blur is earned only where something
genuinely moves behind glass, which is the floating map controls over live
basemap tiles, and nowhere else.

### Inputs / fields
- **Style:** Surface background, Border Strong stroke, 8px radius, 40px minimum
  height, 9px by 11px padding. The stroke owes 3:1 against its surface; it is a
  control boundary, not a divider.
- **Focus:** Solid Deep Pollen ring with clear offset.
- **Error / Disabled:** Include text, icon, or state copy. Do not rely on color
  alone for operational meaning.
- **Composition:** Use shadcn `Field`, `FieldGroup`, `Input`, `Textarea`,
  `Select` / `NativeSelect`, `Checkbox`, `RadioGroup`, `Switch`, and
  `InputGroup` patterns instead of hand-rolled label/control stacks.

### Navigation

Both front ends wear the same two-rail shell from
`@simmer-mosquito/ui-web/components/app-shell`: a primary rail of domains, a
secondary panel of that domain's navigation, and a breadcrumb header. The
operator console no longer has chrome of its own. It supplies a navigation
model and identity, and the shell does the rest. Its rail carries three domains
(Agencies, Mosquito Taxonomy, Units) and its switcher names the control plane
rather than an agency, because every page there spans all of them.

**The Desktop Floor Rule.** SIMMER web is a desktop application. The two-rail
shell spends 304px on fixed chrome, and both rails stay visible at every width.
They do not collapse, and there is no mobile shell. Below the floor set in
`apps/web/src/styles.css` the page takes a horizontal scrollbar rather than
reflowing, because a crushed operational table is worse than a scrolled one.

Routes may still use breakpoints for internal density (column counts, padding
steps, breadcrumb truncation); the header already does. What they must not do
is assume a phone-width viewport is a supported layout target, or add a
narrow-width branch that only pays off in a shell we do not ship.

### Drawers

Drawers are for committed interruption that must preserve the page underneath.
Use full-height right-side geometry, no decorative shadow, and a scrim only when
the drawer blocks the main workflow.

**The One Create Shape Rule.** Creating a record is a full page when the record
is long, and a dialog when it is short. The same choice holds for editing it. Both apps use `RecordFormPage` for the long ones (a dozen forms in the
agency workspace; creating an agency in the console) and a dialog for the short
catalog rows. Creating an organization used to be a 520px sheet, which put the
one decision worth deliberating, whether the operator links themselves as the
agency's first owner, below the fold. That is the shape this rule exists to
prevent.

A create form pinned permanently above its own list is not a third option. It
spends vertical space on every visit to serve the rarest action, and it makes
adding and editing two different experiences of one operation.

### Record lists

Record lists should beat tables when the task is inspection plus action. Use
one primary label, one supporting metadata line, and compact fact groups for
role, status, sync state, or related identifiers.

### Map layers (signature)

Map paint is the one place the token system cannot reach: Mapbox GL paint
properties are evaluated by the GL renderer, not the CSS cascade, so they cannot
read custom properties and must be literals. That constraint is real; scattering
the literals is not. Every colour a layer paints with is named once in
`@simmer-mosquito/design-tokens/map-palette`, in four groups:

- **Interaction**: `selected`, `selectedStroke`, `pointStroke`. Roles that mean
  the same thing on every layer.
- **Lifecycle**: `active`, `inactive`, `inaccessible`. Shared by every locatable
  record type; composed from the brand scale so a brand change reaches the map.
- **Domain**: the per-type hue that lets an operator tell a trap from a
  chemical application at a glance. These *should* differ.
- **Status / Density**: shared status tones, plus the ordered larval density
  ramp, which is a sequential magnitude scale and deliberately not built from the
  domain hues.

**The One Selection Rule.** Selection is amber everywhere, on every layer, and
matches what the draw tool paints. It drifted once, to amber on addresses and
regions and green on seven other layers, which meant selection said something
different depending on which record you clicked. Green is also already spoken
for as a *domain* mark, so a green halo on an active trap says nothing.

**The Legend Truth Rule.** A map legend reads its swatches from the same
constants the layers paint with. Never a literal. A hand-typed legend swatch
drifted into describing a colour that was not on the map, and stayed wrong
because a legend looks correct as long as it looks plausible.

## 6. Do's and don'ts

### Do:
- **Do** keep SIMMER Green and SIMMER Yellow stable across every platform.
- **Do** use Poppins as the SIMMER sans serif when touching product surfaces.
- **Do** use OKLCH for CSS tokens and keep neutrals tinted, never pure black or
  pure white.
- **Do** preserve the map as operational context wherever spatial work is the
  user's job.
- **Do** use visual representations before tables when maps, timelines, status
  grouping, spatial overlays, compact summaries, or record relationships
  clarify the work.
- **Do** centralize durable choices in `packages/design-tokens` and component
  variants.
- **Do** use shadcn source components from `packages/ui-web` wherever possible,
  styled with Tailwind semantic tokens.
- **Do** add repeated states, sizes, and visual treatments as `cva` variants and
  compose classes with `cn`.
- **Do** treat SIMMER Operator screens as product-quality surfaces, not
  temporary scaffolding.
- **Do** prove state colours (focus, error, invalid, inactive, selected) with a
  measured contrast ratio, not an eye. They are the ones that ship broken.
- **Do** draw focus rings solid, and use the inverse ring on dark chrome.
- **Do** read map legend swatches from `map-palette` constants, never literals.
- **Do** delete a superseded module when its last caller goes. A plausible-looking
  module nothing imports is a trap, not a spare.

### Don't:
- **Don't** make generic government portal design: boxy forms, weak hierarchy,
  dated chrome, or administrative leftovers.
- **Don't** become an enterprise GIS clone: dense toolbars, overwhelming layer
  panels, crowded controls, or "ArcGIS but worse" interactions.
- **Don't** use dashboard theater: excessive metric cards, generic chart
  blocks, gradient SaaS decoration, or analytics surfaces that exist because
  dashboards are expected.
- **Don't** mimic consumer maps so closely that SIMMER becomes too casual, too
  search-first, or too shallow for operational record keeping.
- **Don't** default to table-first data representation when spatial, temporal,
  status, or relationship views explain the work more directly.
- **Don't** build CSS-only replicas of shadcn primitives such as buttons,
  fields, cards, dialogs, sheets, drawers, tabs, tables, badges, alerts, empty
  states, separators, skeletons, or sidebars.
- **Don't** scatter repeated color, typography, border, radius, shadow, focus,
  or animation classes through app routes when a token or `cva` component
  variant can own the decision.
- **Don't** use colored side-stripe borders, gradient text, decorative
  glassmorphism, identical card grids, or modals as the first design answer.
- **Don't** draw a focus ring, or any indicator that must clear a contrast
  threshold, at partial alpha. It composites toward the very surface it needs to
  stand against.
- **Don't** put a `backdrop-blur` behind a surface that is already opaque. If
  nothing moves behind the glass, it is decoration with a compositing cost.
- **Don't** let a small utility that eager code imports share a module with a
  heavy component. Module imports are all-or-nothing, and that coupling is how
  a charting library ends up in the boot payload.
- **Don't** assume a phone-width viewport is a supported layout target.
