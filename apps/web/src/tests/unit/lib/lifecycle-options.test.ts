import { describe, expect, it } from 'vitest';
import { lifecycleOptions } from '../../../lib/lifecycle-options';

interface TestRow {
	readonly id: string;
	readonly name: string;
	readonly isActive: boolean;
}

function rows(...entries: readonly (readonly [string, string, boolean])[]): readonly TestRow[] {
	return entries.map(([id, name, isActive]) => ({ id, name, isActive }));
}

const toOptions = (input: readonly TestRow[]) =>
	lifecycleOptions(
		input,
		(row) => row.isActive,
		(row) => row.name,
	);

describe('lifecycleOptions', () => {
	it('keeps inactive rows selectable so past work can still be recorded', () => {
		const options = toOptions(rows(['a', 'Retired lot', false]));

		expect(options).toEqual([{ label: 'Retired lot (inactive)', value: 'a' }]);
	});

	it('sorts active rows ahead of inactive ones, each alphabetically', () => {
		const options = toOptions(
			rows(['a', 'Zeta', true], ['b', 'Beta', false], ['c', 'Alpha', true], ['d', 'Alpha', false]),
		);

		expect(options.map((option) => option.value)).toEqual(['c', 'a', 'd', 'b']);
	});

	it('marks only the inactive rows', () => {
		const options = toOptions(rows(['a', 'Current', true], ['b', 'Former', false]));

		expect(options.map((option) => option.label)).toEqual(['Current', 'Former (inactive)']);
	});
});
