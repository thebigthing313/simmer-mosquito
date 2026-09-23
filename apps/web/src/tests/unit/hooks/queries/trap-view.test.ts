import { describe, expect, it } from 'vitest';
import { collectionLabel, trapDisplayName } from '../../../../hooks/queries/trap-view';

describe('trapDisplayName', () => {
	const TRAP = {
		id: '7b1e5c40-3a2f-4d18-9c6b-2e8a0d5f1c93',
		trapName: 'Riverside gravid',
		trapCode: 'GR-014',
	} as const;

	it('joins the code and the name', () => {
		expect(trapDisplayName(TRAP)).toBe('GR-014 - Riverside gravid');
	});

	it('drops the dash when only the code is set', () => {
		expect(trapDisplayName({ ...TRAP, trapName: null })).toBe('GR-014');
	});

	it('drops the dash when only the name is set', () => {
		expect(trapDisplayName({ ...TRAP, trapCode: null })).toBe('Riverside gravid');
	});

	it('names a trap with neither by the head of its id', () => {
		expect(trapDisplayName({ ...TRAP, trapCode: null, trapName: null })).toBe('Trap 7b1e5c40');
	});
});

describe('collectionLabel', () => {
	const AT_TRAP = {
		trapId: '7b1e5c40-3a2f-4d18-9c6b-2e8a0d5f1c93',
		trapName: 'Riverside gravid',
		trapCode: 'GR-014',
		lat: 34.05213,
		lng: -118.24368,
	} as const;

	const NO_TRAP = { ...AT_TRAP, trapId: null, trapName: null, trapCode: null } as const;

	it('answers the trap name', () => {
		expect(collectionLabel(AT_TRAP, { fallback: 'One-off collection' })).toBe(
			'GR-014 - Riverside gravid',
		);
	});

	// The trap rung runs off the collection's own `trapId`, so a trap whose row
	// has not streamed is named by the head of that id rather than dropping to
	// coordinates that name the trap's spot anyway.
	it('names a trap that has not streamed by the head of its id', () => {
		expect(
			collectionLabel(
				{ ...AT_TRAP, trapName: null, trapCode: null },
				{ fallback: 'One-off collection' },
			),
		).toBe('Trap 7b1e5c40');
	});

	// An address the surface passes outranks the coordinates: it is the same
	// place said in words.
	it('answers the address when there is no trap', () => {
		expect(
			collectionLabel(NO_TRAP, {
				addressName: '123 Main St, Edison, NJ 08817',
				fallback: 'One-off collection',
			}),
		).toBe('123 Main St, Edison, NJ 08817');
	});

	it('reads the coordinates when there is no trap and no address', () => {
		expect(collectionLabel(NO_TRAP, { fallback: 'One-off collection' })).toBe(
			'34.05213, -118.24368',
		);
	});

	// #1231: the words were what every one of the five sites drew, on every row
	// with no trap. They are the last rung now.
	it('falls back to the category only when the row carries no centroid', () => {
		expect(
			collectionLabel({ ...NO_TRAP, lat: null, lng: null }, { fallback: 'One-off collection' }),
		).toBe('One-off collection');
	});

	it('passes a blank address over', () => {
		expect(collectionLabel(NO_TRAP, { addressName: '   ', fallback: 'One-off collection' })).toBe(
			'34.05213, -118.24368',
		);
	});
});
