import { brand } from './colors.js';

/**
 * Map paint palette.
 *
 * Mapbox GL paint properties are evaluated by the GL renderer, not the CSS
 * cascade, so they cannot read custom properties — these have to be literals.
 * That constraint is why each tile module grew its own local `colors` block,
 * and why the same semantic role drifted to different values across layers:
 * `selected` was amber on addresses and regions but green on the other seven.
 *
 * Literals are unavoidable. Scattering them is not. Everything a map layer
 * paints with is named once here.
 */

/**
 * Roles that mean the same thing on every layer. These are the ones that were
 * drifting, and the ones that must never drift again — selection has to read
 * identically whether the operator is looking at traps, regions, or habitats.
 */
export const mapInteraction = {
	/**
	 * Selection.
	 *
	 * Amber, not green. Two reasons: the design system assigns Pollen Yellow to
	 * "selected spatial context", and green is already spoken for as a *domain*
	 * mark — active traps, biocontrol activity — so a green selection halo on a
	 * green feature says nothing. Amber is the only hue that stays legible
	 * against every domain mark below.
	 *
	 * Watch the larval density ramp: `mapDensity.light`/`.medium` sit near this
	 * hue. Selection is distinguished there by `selectedStroke` and a larger
	 * radius, not by fill alone — keep it that way.
	 */
	selected: '#f59e0b',
	/** The casing that separates a selected mark from whatever is under it. */
	selectedStroke: '#b45309',
	/** The halo that keeps a point mark legible over dense basemap tiles. */
	pointStroke: '#f9fdfb',
} as const;

/**
 * Record lifecycle, shared by every locatable type. Habitats and traps were
 * each defining these independently at identical values — they mean the same
 * thing, so they resolve to the same constants, and they lean on the brand
 * scale rather than re-stating hexes it already owns.
 */
export const mapLifecycle = {
	active: brand.darkGreen,
	inactive: '#708587',
	inaccessible: brand.red,
} as const;

/**
 * Per-domain marks. These *should* differ — the hue is how an operator tells
 * one record type from another at a glance — but they are still worth naming so
 * two domains don't silently land on the same hue.
 *
 * Where a mark is already a brand colour it references the brand scale, so a
 * brand change propagates to the map instead of quietly diverging from it.
 */
export const mapDomain = {
	address: brand.blue,
	region: brand.blue,
	biocontrol: '#5a9e2f',
	biocontrolLine: '#4a8526',
	chemical: '#7c5cbf',
	chemicalLine: '#6841b8',
	sourceReduction: '#2f9e8f',
	sourceReductionLine: '#27897c',
	/**
	 * Outreach. Magenta is the one family the other control marks leave open —
	 * green, purple, and teal are spoken for, and the warm end belongs to the
	 * density ramp and the selection halo.
	 */
	outreach: '#c4569e',
	outreachLine: '#a84385',
	collection: '#2f9e8f',
	/** Connector lines between related records (inspection routes, habitat runs). */
	connector: brand.blue,
} as const;

/**
 * Status tones shared across layers. `neutral` and `problem` were duplicated
 * between collections, samples, and inspections; they carry the same meaning in
 * each, so they resolve to the same value here.
 */
export const mapStatus = {
	/** No signal / not applicable — dry habitats, zero-larvae samples. */
	neutral: '#8b9a9c',
	/** Needs attention — problem collections, unidentifiable samples. */
	problem: '#d6503f',
	/** Resolved / identified. */
	resolved: '#2f9e8f',
	/** Queued, awaiting work. */
	pending: '#e0a12e',
} as const;

/**
 * Surrounding context — the feature a record was worked against (today, the
 * habitat behind a control action), drawn beneath that record's own geometry on
 * detail maps.
 *
 * Deliberately outside the domain hues and drawn dashed and near-unfilled:
 * context is not a record, and a second saturated shape on a one-record map
 * would read as one. It borrows the neutral status family rather than
 * introducing a hue, because "this is the surround, not the subject" is the
 * same thing `mapStatus.neutral` says about a mark.
 */
export const mapContext = {
	/** The dashed boundary of the surrounding feature. */
	outline: '#5b6b6d',
	/** A barely-there wash inside it, so the surround has extent but no weight. */
	fill: mapStatus.neutral,
} as const;

/**
 * The larval density ramp, keyed by the `larval_density` enum plus the dry tone.
 * Ordered cool to hot. This is a sequential scale carrying operational
 * magnitude, so it is deliberately not built from the domain hues above.
 */
export const mapDensity = {
	dry: mapStatus.neutral,
	none: '#3f93bf',
	light: '#e0b13a',
	medium: '#ea8a3c',
	heavy: '#e0533a',
	veryHeavy: '#b01f2e',
} as const;

export type MapInteractionRole = keyof typeof mapInteraction;
export type MapDomainMark = keyof typeof mapDomain;
export type MapLifecycleState = keyof typeof mapLifecycle;
export type MapStatusTone = keyof typeof mapStatus;
export type MapDensityStep = keyof typeof mapDensity;
