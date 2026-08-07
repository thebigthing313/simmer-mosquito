# SIMMER Mapbox basemap styles

Four Mapbox GL styles for SIMMER, generated from one layer graph and four palettes.

| File | Replaces | For |
| --- | --- | --- |
| `simmer-day.json` | `mapbox://styles/mapbox/streets-v12` | The primary basemap. |
| `simmer-hybrid.json` | `mapbox://styles/mapbox/satellite-streets-v12` | Imagery with SIMMER cartography over it. |
| `simmer-dusk.json` | — (net new) | Dawn/dusk trap runs on a tablet in a truck cab. |
| `simmer-print.json` | — (net new) | Letter-size PDF for board packets and public notices. |

**These four files are generated. Do not hand-edit them** — edit `palette.mjs` or
`layers.mjs` and rebuild, or a Studio round-trip will quietly lose the change.

```sh
node scripts/map-style/build.mjs           # write the styles + preview.html
node scripts/map-style/build.mjs --check    # fail if the built output is stale
node scripts/map-style/contrast.mjs         # measure data marks against each basemap
```

## Preview before you upload

`build.mjs` also emits `preview.html`, with all four styles inlined so it opens
straight off disk — no static server, no Studio account, no upload.

It is **not tracked**: it inlines the four committed JSONs, so keeping it in git
would duplicate them and let it go stale silently. Build it first.

1. `node scripts/map-style/build.mjs`
2. Open `scripts/map-style/preview.html` in a browser.
3. Paste a Mapbox **public** token (`pk.…`). It is kept in `localStorage` only.
4. Switch variants, and watch the zoom readout — it names which staging band you
   are in, so you can check the reveal actually feels right rather than reading
   zoom stops out of JSON.

A Mapbox style is close to unreviewable as source. The whole design lives in how
the zoom stops interact, and nothing in the JSON tells you whether the map is
quiet at z10 and legible at z16. Walk it before committing to it.

## Loading into Mapbox Studio

1. <https://studio.mapbox.com/styles> → **New style** → **Upload style** (bottom
   of the dialog), and pick one of the four JSON files.
2. Repeat per variant. Each becomes its own style with its own
   `mapbox://styles/{username}/{style_id}` URL.
3. **Publish** each style, then copy its style URL from the share menu.

Notes on what Studio will do to the file:

- It rewrites `glyphs` and `sprite` to your account's endpoints. Harmless — every
  font referenced here is Mapbox-hosted, so it resolves either way.
- It preserves the `metadata` block, including the "this is generated" note.
- Editing in Studio and re-exporting will reformat everything. That is fine for
  experimenting, but land real changes in `palette.mjs` / `layers.mjs` and rebuild,
  or the next `--check` run flags the drift.

## Wiring into `apps/web`

`apps/web/src/components/map/map-styles.ts` hardcodes two Mapbox style URLs.
Once the styles are published, that catalogue is where they go — `BASEMAP_STYLES`
already drives the switcher, so adding entries is the whole change. Reading the
ids from the Vite env keeps the published style ids out of source and lets the
current Mapbox styles stay as the fallback until you have uploaded.

This repo does **not** ship that change; the styles here are standalone artifacts.

## The design, and why

Decisions from the design interview, in the order they constrain each other.

### The basemap loses the colour fight

`packages/design-tokens/src/map-palette.ts` already spends blue, green, teal,
purple, magenta, amber, and a six-step cool-to-hot density ramp on data marks.
Anything the basemap paints has to stay clear of all of them.

That is why water here is a desaturated slate (`#c3d2d6`) rather than a
cartographic blue: Streets-style water sits close enough to `mapDomain.address`
(`#2d46b6`) that an address pin over a pond stops reading. Same reason parks are
a grey-green rather than a real green — `mapLifecycle.active` is already green.

Roads carry hierarchy through **width and casing weight, never hue**. A quiet base
cannot afford Streets' warm motorway tints, and once the casings are graded, width
alone turns out to be enough.

The Map-Room Neutral Rule applies to the map itself. `build.mjs` enforces it: pure
`#ffffff` or `#000000` anywhere in a generated style fails the build. (This is why
road fill is `#fcfefd`.)

### Water-first staged reveal

All four feature groups you asked for are in the style, but they are never all
present at once — that is the only way a base carrying this much information stays
quiet enough for the marks to win.

```
z3-8    water + wetland + admin + place labels. Land flat, no roads.
z9-11   water + land cover; terrain fades in; major roads only.
z12-14  water + full road network and names; land cover drops to a tint.
z15+    water + roads + buildings; terrain and land cover off entirely.
```

Water is the one group present at every zoom. It is not context — breeding habitat
is the job — so it holds tonal weight at the agency overview where everything else
has faded out. Hillshade peaks at z11, where terrain explains where water collects,
and is gone by z14 before it can muddy dense marks.

### Water treatment

- **Wetland is its own class.** `landuse_overlay` separates `wetland` from
  `wetland_noveg`; vegetated wetland leans green, unvegetated leans water-ward.
  A dashed edge is what separates them from open water at a glance — done with a
  line rather than `fill-pattern` on purpose, because a pattern needs a sprite
  image and would tie every style to an uploaded asset.
- **Streams get a casing.** `waterway-casing` sits under every linear water layer
  so a 1px ditch still reads over land cover and imagery.
- **Water body labels on**, from `natural_label`, sized by the tileset's own
  `sizerank` so density is governed by feature prominence and not zoom alone.
  Water names run bluer than land names so they read as water, not as place.
- **Intermittent water** — see the tileset limit below. Delivered for streams,
  not for ponds.

### Labels

Roboto Condensed, deliberately a different voice from the Poppins used across
product chrome — narrow enough that "West Kaweah Drainage Canal" fits at 12px, and
hinted well enough to hold at 10px over imagery.

**This is not Barlow Semi Condensed.** You picked the condensed-grotesque register
and I costed Barlow Semi Condensed for it, but Mapbox's hosted catalogue carries
plain `Barlow` only — no semi-condensed cut. A fontstack naming a font Mapbox does
not serve **falls back silently rather than erroring**, so this would have shipped
looking like a design choice. Roboto Condensed is the same register, has
Light/Regular/Bold, and is genuinely hosted. `build.mjs` now hard-fails on any
font outside the verified-available set.

### Boundaries

Neutral grey, clearly subordinate — `#9aa8a6` county at 0.8px dashed against a
SIMMER Region's 2px solid `#2d46b6` plus fill wash. Nothing drawn by the basemap
can be mistaken for an agency object.

### POIs

Civic and coordination only at z13 (`education`, `medical`, `park_like`,
`public_facilities` — schools, hospitals, parks, government facilities), plus a
thin wayfinding set at z15+ (`religion`, `motorist`, `landmark`, `historic`) for
"the trap behind the gas station".

Everything commercial is cut. POIs get one uniform muted dot rather than category
icons: the data marks carry meaning on this map, and coloured POI icons would
compete for exactly the attention the marks need. The `sprite` is still declared
at the style root so maki icons can be switched on later without touching it.

## Known tileset limits

Three things the interview asked for that `mapbox-streets-v8` cannot fully express.
All three are hard limits, not shortcuts.

**Intermittent *ponds* are not expressible.** The `water` source layer is a single
merged polygon per tile with no `class` field — individual water bodies cannot be
filtered at any price. Intermittent water is therefore delivered where the data
supports it: `waterway` carries a real `stream_intermittent` class (drawn dashed),
and `landuse_overlay` separates vegetated from unvegetated wetland. If you need
seasonal ponds distinguished, that has to come from SIMMER's own habitat geometry
as a data layer — which you already have.

**City limits are not available.** The `admin` layer tops out at `admin_level` 2,
which is counties in the US. Municipal boundaries would need a separate uploaded
tileset.

**Barlow Semi Condensed is not hosted.** See Labels above.

## What the contrast pass found

`contrast.mjs` measures every mark in `map-palette.ts` against every basemap
surface it can land on, at the WCAG 1.4.11 3:1 floor for non-text graphical
objects. It reads the real design-tokens build, so it cannot drift from what the
layers paint. (`packages/design-tokens` must be built first.)

It judges a mark legible when **either** its fill or its casing clears the floor —
if the fill sinks into the ground the casing still outlines the shape, and vice
versa. Judging the fill alone condemns most of the palette over water and tells
you nothing actionable; `mapInteraction.pointStroke` exists precisely so point
marks do not depend on ground contrast.

Read the output as a map of where care is needed, **not as a bug list**:

**On Day and Print, the weak marks are a property of the mark palette, not of this
basemap.** The ones weak everywhere are the mid-tone and warm values —
`density.light` (`#e0b13a`), `status.pending`/`progress.skipped` (`#e0a12e`),
`density.medium` (`#ea8a3c`), `status.neutral` (`#8b9a9c`), `sourceReduction`
(`#2f9e8f`), `biocontrol` (`#5a9e2f`). Any pale basemap does this to them,
including the `streets-v12` shipping today. Worth knowing; not introduced here.

`interaction.pointStroke` (`#f9fdfb`) sits at 1.04–1.62:1 against every light
surface, meaning **the point halo does almost nothing on a light basemap**. It
works as designed on Dusk (11.2:1). This is the clearest standing issue in the
existing palette that this pass surfaced.

**On Dusk, the finding is real and specific — and it corrects what I told you
during the interview.** I predicted the blue *fills* would weaken. They don't:
`mapDomain.address` clears comfortably via its halo. What fails is the **dark
casings**, which is a different problem with a different fix. If you wire up Dusk,
these need overrides. Candidates below are measured against the worst dusk surface
(`building`, `#313b3d`), not estimated:

| Role | Today | Worst now | Suggested | Measured |
| --- | --- | --- | --- | --- |
| `interaction.measureStroke` | `#5b21b6` | 1.28:1 | `#a78bfa` | 4.23:1 |
| `domain.chemicalLine` | `#6841b8` | 1.67:1 | `#a78bfa` | 4.23:1 |
| `interaction.measure` | `#7c3aed` | 2.02:1 | `#9b72f8` | 3.38:1 |
| `mapContext.outline` | `#5b6b6d` | 2.07:1 | `#93a7a9` | 4.57:1 |
| `domain.outreachLine` | `#a84385` | 2.09:1 | `#e07cc0` | 4.28:1 |
| `interaction.selectedStroke` | `#b45309` | 2.29:1 | `#fbbf24` | 6.90:1 |
| `domain.biocontrolLine` | `#4a8526` | 2.56:1 | `#7cc44a` | 5.40:1 |
| `domain.sourceReductionLine` | `#27897c` | 2.72:1 | `#4fc9b6` | 5.68:1 |

Hybrid is skipped by the pass: imagery has no fixed colour, so a ratio against it
would be theatre. Marks over imagery rely on their casing, which is why the hybrid
palette darkens road casings and puts labels on a dark halo.

## Changing something

1. Colour → `palette.mjs`. One variant, or all four if the role is shared.
2. Zoom staging, filters, layer order → `layers.mjs`.
3. `node scripts/map-style/build.mjs`, then reload `preview.html`.
4. `node scripts/map-style/contrast.mjs` if you touched a ground, water, or
   building tone — those are the surfaces marks land on.
5. Re-upload to Studio.

The generated JSON is excluded from Biome (`biome.json`), the same way
`routeTree.gen.ts` is: the generator owns the formatting.

Validated against the official spec with:

```sh
pnpm --package=@mapbox/mapbox-gl-style-spec dlx gl-style-validate scripts/map-style/simmer-day.json
```
