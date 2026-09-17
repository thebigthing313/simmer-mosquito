import { describe, expect, it } from 'vitest';
import { coordinateLabel, habitatLabel } from '../../../lib/coordinate-label';

describe('coordinateLabel', () => {
	it('reads both coordinates to five places', () => {
		expect(coordinateLabel(34.05213, -118.24368)).toBe('34.05213, -118.24368');
	});

	// The three detail modules this replaced wrote the same test two ways, one
	// against `typeof lat === 'number'` and one against `lat == null`.
	it('has a word for a record with no latitude', () => {
		expect(coordinateLabel(null, -118.24368)).toBe('Unknown coordinates');
	});

	it('has a word for a record with no longitude', () => {
		expect(coordinateLabel(34.05213, null)).toBe('Unknown coordinates');
	});

	it('has a word for a row that carries no centroid columns', () => {
		expect(coordinateLabel(undefined, undefined)).toBe('Unknown coordinates');
	});

	// Zero is a coordinate, and a falsy test would call it missing.
	it('reads a coordinate of zero', () => {
		expect(coordinateLabel(0, 0)).toBe('0.00000, 0.00000');
	});
});

describe('habitatLabel', () => {
	const AT_HABITAT = {
		habitatId: '0f8c2b61-9f4d-4f2a-a0de-6f3a1c2b4d5e',
		habitatName: 'Alder catch basin',
		lat: 34.05213,
		lng: -118.24368,
	} as const;

	it('answers the habitat name', () => {
		expect(habitatLabel(AT_HABITAT, { fallback: 'Ad-hoc sample' })).toBe('Alder catch basin');
	});

	it('answers the address when the habitat has no name', () => {
		expect(
			habitatLabel(
				{ ...AT_HABITAT, habitatName: null },
				{ addressName: '123 Main St, Edison, NJ 08817', fallback: 'Ad-hoc sample' },
			),
		).toBe('123 Main St, Edison, NJ 08817');
	});

	// A surface carrying no address passes none, and an unnamed habitat is still
	// a habitat, so it is named by the head of the id a person can search.
	it('names an unnamed habitat by the head of its id', () => {
		expect(habitatLabel({ ...AT_HABITAT, habitatName: null }, { fallback: 'Ad-hoc sample' })).toBe(
			'Habitat 0f8c2b61',
		);
	});

	// #918: the sample detail read the bare word `Ad-hoc` here, which names the
	// category every such row belongs to and tells no row from the next.
	it('reads the coordinates when there is no habitat', () => {
		expect(
			habitatLabel(
				{ ...AT_HABITAT, habitatId: null, habitatName: null },
				{ fallback: 'Ad-hoc sample' },
			),
		).toBe('34.05213, -118.24368');
	});

	it('falls back to the category only when the row carries no centroid', () => {
		expect(
			habitatLabel(
				{ habitatId: null, habitatName: null, lat: null, lng: null },
				{ fallback: 'Ad-hoc sample' },
			),
		).toBe('Ad-hoc sample');
	});

	// A name of spaces is a name nothing reads, which is what the trim is for.
	it('passes a blank habitat name over', () => {
		expect(
			habitatLabel({ ...AT_HABITAT, habitatName: '   ' }, { fallback: 'Ad-hoc inspection' }),
		).toBe('Habitat 0f8c2b61');
	});
});
