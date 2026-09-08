/**
 * The five property keys a draw feature carries, and the expression builders
 * that read one back.
 *
 * `./draw-features` writes `role`, `refused`, `highlighted`, `ring` and
 * `vertex`; `drawLayers` in `./use-map-draw` paints by three of them through
 * Mapbox `['get', ...]` expressions, and the pointer hit-test reads the other
 * two off a queried feature. Those two sides were one file when the vocabulary
 * was invented and have been two since #630, so a rename touched one of them
 * and looked complete: the bag was typed `GeoJSON.GeoJsonProperties`, which is
 * `{ [name: string]: unknown } | null`, and nothing related what was written to
 * what was read (#769).
 *
 * So the keys are declared once here and both sides name this module. The
 * writers name {@link DrawFeatureProperties} on the bag they build; the readers
 * cannot name a type, because a Mapbox expression is data, so they go through
 * {@link drawFeatureIs}, {@link drawFeatureFlag} and
 * {@link readDrawFeatureProperty}, whose key parameter is `keyof
 * DrawFeatureProperties` and whose value parameter is the type declared for
 * that key. A key the type does not declare, or a `role` outside the union,
 * fails `tsc` at the call site.
 *
 * `role` carries a value vocabulary as well as a name, and it is the half that
 * breaks: `['==', ['get', 'role'], 'point']` against a feature written as
 * `'vertex'` hit-tests nothing and paints nothing, so `role` is a union rather
 * than `string`.
 *
 * The mapbox-gl import is types only and erases, so the modules that state they
 * pull in no renderer still do not.
 */

import type { ExpressionSpecification } from 'mapbox-gl';

/**
 * What a feature the draw control puts in its source may carry.
 *
 * Every key is optional because a feature carries the ones its layer and the
 * hit-test need and no more: a draft's vertices carry `role` and `refused`, and
 * an edit's carry `ring` and `vertex` on top of them so the pointer reads the
 * corner off the feature rather than searching the rings for it. Every
 * expression below falls back for a property a feature does not have, which is
 * what makes the partial bag safe.
 */
export type DrawFeatureProperties = {
	/** Which circle layer draws the feature, for the two that draw points. */
	readonly role?: 'vertex' | 'point';
	/** Whether the control would refuse the shape as it stands, painted red. */
	readonly refused?: boolean;
	/** Whether the pointer is on this piece or this corner, painted heavier. */
	readonly highlighted?: boolean;
	/** Which ring of the edited part a vertex sits on. */
	readonly ring?: number;
	/** Where in that ring it sits. */
	readonly vertex?: number;
};

/** The keys whose value is a flag, which is what `['boolean', ...]` reads. */
type DrawFeatureFlagKey = {
	[K in keyof DrawFeatureProperties]-?: NonNullable<DrawFeatureProperties[K]> extends boolean
		? K
		: never;
}[keyof DrawFeatureProperties];

/**
 * `['==', ['get', key], value]` for a key these features declare, and a value
 * the key is declared to hold.
 *
 * `value` is deliberately `NoInfer`: a generic inferred from two positions
 * constrains neither, so leaving it inferable would widen `K` to whatever made
 * the pair agree and check nothing while reading as if it did.
 */
export function drawFeatureIs<K extends keyof DrawFeatureProperties>(
	key: K,
	value: NoInfer<NonNullable<DrawFeatureProperties[K]>>,
): ExpressionSpecification {
	return ['==', ['get', key], value];
}

/** `['boolean', ['get', key], false]` for a flag these features declare. */
export function drawFeatureFlag(key: DrawFeatureFlagKey): ExpressionSpecification {
	return ['boolean', ['get', key], false];
}

/**
 * One property off a feature the map answered a query with.
 *
 * The return is `unknown` on purpose. A queried feature is untyped whatever
 * this module declares, so the caller's `typeof` guard is doing real work and
 * is not made redundant by the key being checked here.
 */
export function readDrawFeatureProperty(
	feature: { readonly properties?: Readonly<Record<string, unknown>> | null } | undefined,
	key: keyof DrawFeatureProperties,
): unknown {
	return feature?.properties?.[key];
}
