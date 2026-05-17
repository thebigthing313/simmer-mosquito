---
name: SIMMER
description: Map-centric mosquito control operations UI for focused agency work.
colors:
  field-green: "oklch(52.71% 0.1114 159.1429)"
  deep-field-green: "oklch(39.15% 0.0882 156.38)"
  root-green: "oklch(31.82% 0.0732 156.0959)"
  pollen-yellow: "oklch(96.23% 0.052 108.52)"
  survey-purple: "oklch(49.37% 0.1424 325.97)"
  alert-red: "oklch(61.56% 0.2307 16.37)"
  operations-blue: "oklch(44.83% 0.1791 268.37)"
  app-bg: "oklch(96% 0.008 165)"
  surface: "oklch(99% 0.004 165)"
  surface-muted: "oklch(94.5% 0.009 165)"
  surface-strong: "oklch(90% 0.016 165)"
  border: "oklch(86% 0.018 205)"
  border-strong: "oklch(77% 0.03 205)"
  text: "oklch(24% 0.025 205)"
  muted: "oklch(48% 0.028 205)"
  quiet: "oklch(60% 0.024 205)"
  attention: "oklch(84% 0.14 92)"
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
---

# Design System: SIMMER

## 1. Overview

**Creative North Star: "The Field Operations Map Room"**

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
- Durable tokens in `packages/design-tokens`, then component variants, then
  route-level styling only as a last resort.

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
  warning-adjacent surfaces that are not errors, focus affordances, and
  lightweight emphasis.

### Tertiary
- **Operations Blue**: Reserved for informational or sync-oriented product
  states when green would imply success.
- **Survey Purple**: Reserved for taxonomy, analysis, or categorical accents
  when a distinct non-status color is required.
- **Alert Red**: Error and destructive-state color only.

### Neutral
- **App Background**: The page field behind product surfaces.
- **Surface**: Default panel, drawer, input, and topbar surface.
- **Surface Muted**: Sidebar, fact tiles, compact rows, and quiet grouped
  containers.
- **Surface Strong**: Denser tonal separation when muted is not enough.
- **Border / Border Strong**: Structural dividers and field strokes.
- **Text / Muted / Quiet**: Primary copy, supporting copy, and metadata labels.
- **Attention / Warning**: Focus rings and warning text treatment.

### Named Rules

**The Earned Color Rule.** Every non-neutral color must carry a semantic job:
action, status, selection, focus, taxonomy, sync, or spatial meaning.

**The Map-Room Neutral Rule.** Neutral surfaces are tinted toward green and blue.
Never use pure black or pure white.

**The No Decoration Rule.** Product screens use color to clarify work, not to
fill empty space.

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

### Named Rules

**The Poppins Rule.** Poppins is the intended SIMMER sans serif. Replace current
Inter/system stacks as product surfaces are touched.

**The Product Type Rule.** Typography must help users scan and act. Do not use
display styling in labels, buttons, tables, forms, or dense controls.

## 4. Elevation

SIMMER is flat by default. Depth comes from tonal layering, borders, spatial
placement, and drawer geometry. Shadows are allowed only when a surface truly
floats above the current task, such as a drawer, popover, menu, or map control.

### Shadow Vocabulary

- **Legacy Ambient Panel** (`0 10px 30px rgb(24 38 50 / 8%)`): Existing web
  shell panel shadow. Do not expand this as a default pattern.
- **Backdrop Scrim** (`oklch(24% 0.025 205 / 35%)`): Modal drawer backdrop for
  committed interruption.

### Named Rules

**The Flat Until Floating Rule.** Resting surfaces are flat. Floating surfaces
must earn depth by interrupting, overlaying, or anchoring to a map/task context.

## 5. Components

Components should feel compact, durable, and operational. A user should be able
to scan a screen repeatedly without fighting decorative chrome.

### Buttons
- **Shape:** Gently curved rectangles (8px radius).
- **Primary:** Deep Field Green background, light surface text, 40px height, and
  16px horizontal padding. Use once per local workflow when possible.
- **Hover / Focus:** Hover deepens the green. Focus uses a visible Pollen Yellow
  outline with offset.
- **Secondary / Subtle:** White or muted surface background with green or muted
  text. Use for navigation, row actions, and cancellation-like commands.

### Chips
- **Style:** Not formalized yet. Start from compact bordered pills on muted
  surface, with status conveyed by text or icon plus color.
- **State:** Selected, filter, status, and map-layer meanings must be visually
  distinct without relying on color alone.

### Cards / Containers
- **Corner Style:** Gently curved (8px radius) for panels, fact tiles, sidebars,
  forms, and rows.
- **Background:** Surface for primary panels; Surface Muted for sidebars, fact
  tiles, and compact groupings.
- **Shadow Strategy:** Follow the Flat Until Floating Rule.
- **Border:** One-pixel structural border only. Colored side stripes are
  forbidden.
- **Internal Padding:** 16px for compact groups; clamp(20px, 4vw, 30px) for
  panels.

### Inputs / Fields
- **Style:** Surface background, Border Strong stroke, 8px radius, 40px minimum
  height, 9px by 11px padding.
- **Focus:** Pollen Yellow focus outline with clear offset.
- **Error / Disabled:** Include text, icon, or state copy. Do not rely on color
  alone for operational meaning.

### Navigation

The admin control plane uses a left sidebar with muted surface, compact links,
and active state through tonal contrast. Topbars stay low and structural:
brand, section navigation, and auth entry points only. On mobile, sidebars
collapse into a wrapped grid instead of becoming a modal first.

### Drawers

Drawers are the preferred committed-interruption pattern for long create flows
such as new organizations. They slide the task into focus while preserving the
page underneath. Use full-height right-side geometry, no decorative shadow, and
a scrim only when the drawer blocks the main workflow.

### Record Lists

Record lists should beat tables when the task is inspection plus action. Use
one primary label, one supporting metadata line, and compact fact groups for
role, status, sync state, or related identifiers.

## 6. Do's and Don'ts

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
- **Do** treat SIMMER Operator screens as product-quality surfaces, not
  temporary scaffolding.

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
- **Don't** use colored side-stripe borders, gradient text, decorative
  glassmorphism, identical card grids, or modals as the first design answer.
