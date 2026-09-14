import { describe, expect, it } from 'vitest';
import { groupRows, UNASSIGNED_GROUP_KEY } from '../../../lib/row-groups';

interface Row {
	readonly id: string;
	readonly profileId: string | null;
	readonly profileName: string | null;
}

function row(id: string, profileId: string | null, profileName: string | null): Row {
	return { id, profileId, profileName };
}

function group(rows: readonly Row[]) {
	return groupRows(rows, {
		key: (entry) => entry.profileId,
		name: (entry) => entry.profileName,
		unknownName: 'Unknown inspector',
	});
}

describe('groupRows', () => {
	it('orders named groups alphabetically and puts the unassigned one last', () => {
		const groups = group([
			row('1', null, null),
			row('2', 'p-zoe', 'Zoe'),
			row('3', 'p-ana', 'Ana'),
			row('4', null, null),
		]);

		expect(groups.map((entry) => entry.name)).toEqual(['Ana', 'Zoe', 'Unassigned']);
		expect(groups.at(-1)?.key).toBe(UNASSIGNED_GROUP_KEY);
		expect(groups.at(-1)?.rows.map((entry) => entry.id)).toEqual(['1', '4']);
	});

	it('keeps the unassigned group last when it is the only group', () => {
		const groups = group([row('1', null, null)]);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.name).toBe('Unassigned');
	});

	it('collects a key into one group and keeps the rows in the order they arrived', () => {
		const groups = group([
			row('1', 'p-ana', 'Ana'),
			row('2', 'p-zoe', 'Zoe'),
			row('3', 'p-ana', 'Ana'),
		]);

		expect(groups).toHaveLength(2);
		expect(groups[0]?.rows.map((entry) => entry.id)).toEqual(['1', '3']);
	});

	it('takes a group name off its first row and falls back when that row has none', () => {
		const groups = group([row('1', 'p-ana', null), row('2', 'p-ana', 'Ana')]);

		expect(groups[0]?.name).toBe('Unknown inspector');
	});

	it('keeps two groups whose names compare equal in the order they first arrived', () => {
		const groups = group([
			row('1', 'p-second', 'Ana'),
			row('2', 'p-first', 'Ana'),
			row('3', 'p-second', 'Ana'),
		]);

		expect(groups.map((entry) => entry.key)).toEqual(['p-second', 'p-first']);
	});

	it('returns nothing for no rows', () => {
		expect(group([])).toEqual([]);
	});
});
