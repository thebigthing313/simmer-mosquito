/**
 * The summary toggle groups `declaredSummaryGroupings` builds from a filter's
 * declaration, once per kind rather than once per record set (#1421).
 *
 * A group writes the filter it names through `setFilters`, a value the filter
 * already holds is selected, and clicking a selected value widens the filter
 * back out. A value no record in view carries is not drawn, and the records
 * with no value are dropped or drawn as text as the declaration says.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SummaryGroup } from '../../../../components/explorer/explorer-summary';
import {
	declaredSummaryGroupings,
	defineFilterDeclarations,
	REGION_SOURCE,
} from '../../../../components/explorer/filter-declarations';
import type { RecordSetLinks } from '../../../../components/explorer/record-set';
import type { MapSummary } from '../../../../hooks/explorer/use-explorer-summary';
import { choiceParam, choiceSetParam, flagParam, idSetParam } from '../../../../lib/search-filters';

interface Filters {
	readonly places: ReadonlySet<string>;
	readonly flagged: boolean;
	readonly state: 'all' | 'open' | 'shut';
	readonly sizes: ReadonlySet<'small' | 'large'>;
	readonly hidden: boolean;
}

const DEFAULTS: Filters = {
	places: new Set(),
	flagged: false,
	state: 'all',
	sizes: new Set(),
	hidden: false,
};

const set: RecordSetLinks<Filters> = {
	recordType: 'habitat',
	paths: { map: '/larval-surveillance/habitats', table: '/larval-surveillance/habitats/table' },
	codecs: {
		places: idSetParam,
		flagged: flagParam,
		state: choiceParam(['all', 'open', 'shut'], 'all'),
		sizes: choiceSetParam(['small', 'large']),
		hidden: flagParam,
	},
	applies: { places: 'both', flagged: 'both', state: 'both', sizes: 'both', hidden: 'both' },
};

function SizeField() {
	return null;
}

const declarations = defineFilterDeclarations(set, [
	{
		kind: 'idSet',
		key: 'places',
		label: 'Place',
		empty: 'No places',
		options: REGION_SOURCE,
		unknown: 'Unknown place',
		summary: { grouping: 'placeId', title: 'Place', none: 'No place' },
	},
	{
		kind: 'flag',
		key: 'flagged',
		label: 'Flagged only',
		summary: { grouping: 'isFlagged', title: 'Flags', label: 'Flagged' },
	},
	{
		kind: 'choice',
		key: 'state',
		label: 'State',
		options: [
			{ value: 'all', label: 'All' },
			{ value: 'open', label: 'Open' },
			{ value: 'shut', label: 'Shut' },
		],
		summary: {
			grouping: 'isOpen',
			title: 'State',
			sides: [
				{ value: 'open', match: true },
				{ value: 'shut', match: false },
			],
		},
	},
	{
		kind: 'choiceSet',
		key: 'sizes',
		label: 'Size',
		options: [
			{ value: 'small', label: 'Small' },
			{ value: 'large', label: 'Large' },
		],
		field: SizeField,
		summary: { grouping: 'size', title: 'Size', none: 'No size' },
	},
	{ kind: 'flag', key: 'hidden', label: 'Hidden' },
]);

const SUMMARY: MapSummary = {
	total: 300,
	groups: {
		placeId: [
			{ value: 'place-north', count: 120 },
			{ value: 'place-gone', count: 60 },
			{ value: null, count: 20 },
		],
		isFlagged: [
			{ value: false, count: 200 },
			{ value: true, count: 100 },
		],
		isOpen: [
			{ value: false, count: 180 },
			{ value: true, count: 120 },
		],
		size: [
			{ value: 'large', count: 200 },
			{ value: null, count: 40 },
			{ value: 'small', count: 60 },
		],
	},
};

const NAMES = { places: new Map([['place-north', 'North Marsh']]) };

function groupsOf(
	name: 'places' | 'flagged' | 'state' | 'sizes',
	filters: Partial<Filters> = {},
	summary: MapSummary = SUMMARY,
) {
	const setFilters = vi.fn<(patch: Partial<Filters>) => void>();
	const [grouping] = declaredSummaryGroupings(declarations, [name], {
		summary,
		filters: { ...DEFAULTS, ...filters },
		setFilters,
		names: NAMES,
	});
	if (grouping === undefined) {
		throw new Error(`No ${name} grouping`);
	}
	return { grouping, setFilters };
}

function named(groups: readonly SummaryGroup[], label: string): SummaryGroup {
	const group = groups.find((candidate) => candidate.label === label);
	if (group === undefined) {
		throw new Error(`No ${label} group`);
	}
	return group;
}

describe('an id set grouping', () => {
	it('names each id from the source, the rest as unknown, and the null group as text', () => {
		const { grouping } = groupsOf('places');

		expect(grouping.title).toBe('Place');
		expect(grouping.groups.map((group) => [group.label, group.count])).toEqual([
			['North Marsh', 120],
			['Unknown place', 60],
			['No place', 20],
		]);
		expect(named(grouping.groups, 'No place').onToggle).toBeUndefined();
	});

	it('adds an id, and widens a selected one back out', () => {
		const { grouping, setFilters } = groupsOf('places', { places: new Set(['place-gone']) });

		named(grouping.groups, 'North Marsh').onToggle?.();
		expect(setFilters).toHaveBeenLastCalledWith({
			places: new Set(['place-gone', 'place-north']),
		});

		const selected = named(grouping.groups, 'Unknown place');
		expect(selected.isSelected).toBe(true);
		selected.onToggle?.();
		expect(setFilters).toHaveBeenLastCalledWith({ places: new Set() });
	});
});

describe('a flag grouping', () => {
	it('draws the on side alone, which sets the flag and clears it once set', () => {
		const off = groupsOf('flagged');
		expect(off.grouping.groups.map((group) => [group.label, group.count])).toEqual([
			['Flagged', 100],
		]);
		off.grouping.groups[0]?.onToggle?.();
		expect(off.setFilters).toHaveBeenLastCalledWith({ flagged: true });

		const on = groupsOf('flagged', { flagged: true });
		expect(on.grouping.groups[0]?.isSelected).toBe(true);
		on.grouping.groups[0]?.onToggle?.();
		expect(on.setFilters).toHaveBeenLastCalledWith({ flagged: false });
	});

	it('draws nothing when no record in view carries the flag', () => {
		const { grouping } = groupsOf(
			'flagged',
			{},
			{
				total: 10,
				groups: { isFlagged: [{ value: false, count: 10 }] },
			},
		);

		expect(grouping.groups).toEqual([]);
	});
});

describe('a choice grouping', () => {
	it('draws the sides in their declared order, whichever holds more', () => {
		const { grouping } = groupsOf('state');

		expect(grouping.groups.map((group) => [group.label, group.count])).toEqual([
			['Open', 120],
			['Shut', 180],
		]);
	});

	it('sets the side clicked, and widens the selected side back to all', () => {
		const { grouping, setFilters } = groupsOf('state', { state: 'shut' });

		named(grouping.groups, 'Open').onToggle?.();
		expect(setFilters).toHaveBeenLastCalledWith({ state: 'open' });

		const selected = named(grouping.groups, 'Shut');
		expect(selected.isSelected).toBe(true);
		selected.onToggle?.();
		expect(setFilters).toHaveBeenLastCalledWith({ state: 'all' });
	});
});

describe('a choice set grouping', () => {
	it('draws the values in their declared order, and the null group as text after them', () => {
		const { grouping } = groupsOf('sizes');

		expect(grouping.groups.map((group) => [group.label, group.count])).toEqual([
			['Small', 60],
			['Large', 200],
			['No size', 40],
		]);
		expect(named(grouping.groups, 'No size').onToggle).toBeUndefined();
	});

	it('adds a value, and widens a selected one back out', () => {
		const { grouping, setFilters } = groupsOf('sizes', { sizes: new Set(['large'] as const) });

		named(grouping.groups, 'Small').onToggle?.();
		expect(setFilters).toHaveBeenLastCalledWith({ sizes: new Set(['large', 'small']) });

		const selected = named(grouping.groups, 'Large');
		expect(selected.isSelected).toBe(true);
		selected.onToggle?.();
		expect(setFilters).toHaveBeenLastCalledWith({ sizes: new Set() });
	});
});

describe('declaredSummaryGroupings', () => {
	it('refuses a filter that declares no summary grouping', () => {
		expect(() =>
			declaredSummaryGroupings(declarations, ['hidden'], {
				summary: SUMMARY,
				filters: DEFAULTS,
				setFilters: () => undefined,
			}),
		).toThrow('The hidden filter declares no summary grouping.');
	});
});
