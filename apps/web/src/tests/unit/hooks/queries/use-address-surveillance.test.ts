import { describe, expect, it } from 'vitest';
import { groupByAddress } from '../../../../hooks/queries/use-address-surveillance';

const row = (id: string, addressId: string | null, name: string) => ({
	id,
	addressId,
	name,
	isActive: true,
});

describe('groupByAddress', () => {
	it('buckets rows under the address they point at', () => {
		const grouped = groupByAddress(
			[row('h1', 'a1', 'Alder'), row('h2', 'a2', 'Birch'), row('h3', 'a1', 'Cedar')],
			(habitat) => habitat,
		);

		expect([...(grouped.get('a1') ?? [])].map((link) => link.id)).toEqual(['h1', 'h3']);
		expect([...(grouped.get('a2') ?? [])].map((link) => link.id)).toEqual(['h2']);
	});

	it('sorts each bucket by name, not by arrival', () => {
		const grouped = groupByAddress(
			[row('h1', 'a1', 'Zephyr'), row('h2', 'a1', 'Alder')],
			(habitat) => habitat,
		);

		expect([...(grouped.get('a1') ?? [])].map((link) => link.name)).toEqual(['Alder', 'Zephyr']);
	});

	it('drops a row that names no address rather than bucketing it under one', () => {
		const grouped = groupByAddress([row('h1', null, 'Alder')], (habitat) => habitat);

		expect(grouped.size).toBe(0);
	});

	it('has no entry for an address nothing is sited at', () => {
		const grouped = groupByAddress([row('h1', 'a1', 'Alder')], (habitat) => habitat);

		expect(grouped.get('a2')).toBeUndefined();
	});
});
