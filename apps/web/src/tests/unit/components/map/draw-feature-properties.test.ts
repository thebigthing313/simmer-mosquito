import { describe, expect, it } from 'vitest';
import {
	type DrawFeatureProperties,
	drawFeatureFlag,
	drawFeatureIs,
	readDrawFeatureProperty,
} from '../../../../components/map/draw-feature-properties';

/*
 * The draw control's property vocabulary, asserted as a type as much as as a
 * value (#769).
 *
 * The keys were untyped strings written in `draw-features.ts` and read back in
 * `use-map-draw.ts`, so renaming one on either side compiled and painted the
 * wrong thing. The `@ts-expect-error` cases below are the point of this file:
 * each one fails the suite if the compiler ever stops refusing, which is what a
 * type both sides merely mention would not catch. The plain assertions are what
 * the expressions have to be for Mapbox to evaluate them.
 */

describe('draw feature properties', () => {
	it('builds the equality expression a layer filter compares a role with', () => {
		expect(drawFeatureIs('role', 'vertex')).toEqual(['==', ['get', 'role'], 'vertex']);
		expect(drawFeatureIs('role', 'point')).toEqual(['==', ['get', 'role'], 'point']);
	});

	it('builds the flag expression a paint property falls back to false on', () => {
		expect(drawFeatureFlag('refused')).toEqual(['boolean', ['get', 'refused'], false]);
		expect(drawFeatureFlag('highlighted')).toEqual(['boolean', ['get', 'highlighted'], false]);
	});

	// A queried feature is untyped whatever this module declares, so the caller's
	// `typeof` guard stays and this reads back as `unknown`.
	it('reads a property off a queried feature', () => {
		const feature = { properties: { ring: 1, vertex: 2 } };

		expect(readDrawFeatureProperty(feature, 'ring')).toBe(1);
		expect(readDrawFeatureProperty(feature, 'vertex')).toBe(2);
		expect(readDrawFeatureProperty(undefined, 'ring')).toBeUndefined();
		expect(readDrawFeatureProperty({ properties: null }, 'ring')).toBeUndefined();
	});

	// A draft's vertices carry two keys and an edit's carry four, so a bag that
	// names some of them is the shape the writers build.
	it('accepts a bag carrying only the keys its feature needs', () => {
		const draftVertex: DrawFeatureProperties = { role: 'vertex', refused: false };
		const editVertex: DrawFeatureProperties = {
			role: 'vertex',
			refused: false,
			ring: 0,
			vertex: 3,
			highlighted: true,
		};

		expect(draftVertex.ring).toBeUndefined();
		expect(editVertex.ring).toBe(0);
	});

	it('refuses a key the vocabulary does not declare', () => {
		// @ts-expect-error 'corner' is not a key a draw feature carries.
		expect(() => drawFeatureIs('corner', 'vertex')).toBeDefined();
		// @ts-expect-error 'rings' is the misspelling that used to paint nothing.
		expect(() => readDrawFeatureProperty({ properties: {} }, 'rings')).toBeDefined();
		const misspelled: DrawFeatureProperties = {
			role: 'vertex',
			// @ts-expect-error 'refuse' is not the key the refusal layer reads.
			refuse: true,
		};

		expect(misspelled.refused).toBeUndefined();
	});

	it('refuses a role outside the union the layers compare against', () => {
		// @ts-expect-error the two circle layers filter on 'vertex' and 'point'.
		expect(() => drawFeatureIs('role', 'corner')).toBeDefined();
		const wrongRole: DrawFeatureProperties = {
			// @ts-expect-error same union, on the writing side.
			role: 'centre',
		};

		expect(wrongRole.role).toBe('centre');
	});

	it('refuses a key whose value is not a flag as a flag', () => {
		// @ts-expect-error `ring` holds a number, so `['boolean', ...]` is wrong.
		expect(() => drawFeatureFlag('ring')).toBeDefined();
		// @ts-expect-error `role` holds a string, and its own expression is above.
		expect(() => drawFeatureFlag('role')).toBeDefined();
	});
});
