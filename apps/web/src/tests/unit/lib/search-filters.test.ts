/** @vitest-environment jsdom */
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	choiceParam,
	choiceSetParam,
	countActiveFilters,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
	searchValidator,
	textParam,
	useSearchFilters,
} from '../../../lib/search-filters';

// The hook reads the URL through the router and writes it through `navigate`,
// which is the whole of what it touches, so a stub of those two is the harness.
const router = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: {} as Record<string, unknown>,
}));

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => router.navigate,
	useSearch: () => router.search,
}));

afterEach(cleanup);

describe('textParam', () => {
	it('drops blank text so a cleared box leaves no param behind', () => {
		expect(textParam.encode('')).toBeUndefined();
		expect(textParam.encode('   ')).toBeUndefined();
		expect(textParam.decode('')).toBeUndefined();
	});

	it('round-trips a search term', () => {
		expect(textParam.encode('marsh')).toBe('marsh');
		expect(textParam.decode('marsh')).toBe('marsh');
	});
});

describe('dateParam', () => {
	it('round-trips an ISO date', () => {
		expect(dateParam.decode('2026-08-03')).toBe('2026-08-03');
		expect(dateParam.encode('2026-08-03')).toBe('2026-08-03');
	});

	it('spells out "no bound" so All time survives a reload', () => {
		expect(dateParam.encode('')).toBe('any');
		expect(dateParam.decode('any')).toBe('');
	});

	it('ignores anything that is not a date', () => {
		expect(dateParam.decode('yesterday')).toBeUndefined();
		expect(dateParam.decode(20260803)).toBeUndefined();
		expect(dateParam.decode(null)).toBeUndefined();
	});
});

describe('flagParam', () => {
	it('only appears in the URL when on', () => {
		expect(flagParam.encode(true)).toBe(true);
		expect(flagParam.encode(false)).toBeUndefined();
	});

	it('reads the string form a hand-edited URL produces', () => {
		expect(flagParam.decode('true')).toBe(true);
		expect(flagParam.decode(true)).toBe(true);
		expect(flagParam.decode('yes')).toBeUndefined();
	});
});

describe('choiceParam', () => {
	const status = choiceParam(['all', 'active', 'inactive'] as const, 'active');

	it('leaves the default out of the URL', () => {
		expect(status.encode('active')).toBeUndefined();
		expect(status.encode('inactive')).toBe('inactive');
	});

	it('ignores a value outside the set', () => {
		expect(status.decode('retired')).toBeUndefined();
		expect(status.decode('all')).toBe('all');
	});
});

describe('idSetParam', () => {
	it('round-trips a selection', () => {
		expect(idSetParam.encode(new Set(['a', 'b']))).toEqual(['a', 'b']);
		expect(idSetParam.decode(['a', 'b'])).toEqual(new Set(['a', 'b']));
	});

	it('drops an empty selection', () => {
		expect(idSetParam.encode(new Set())).toBeUndefined();
		expect(idSetParam.decode([])).toBeUndefined();
	});

	it('accepts the comma-joined form a hand-edited URL produces', () => {
		expect(idSetParam.decode('a,b')).toEqual(new Set(['a', 'b']));
	});
});

describe('choiceSetParam', () => {
	const density = choiceSetParam(['light', 'heavy'] as const);

	it('drops members outside the set rather than failing the whole param', () => {
		expect(density.decode(['heavy', 'catastrophic'])).toEqual(new Set(['heavy']));
		expect(density.decode(['catastrophic'])).toBeUndefined();
	});
});

describe('searchValidator', () => {
	const validate = searchValidator({
		from: dateParam,
		status: choiceParam(['all', 'open', 'closed'] as const, 'open'),
		tags: idSetParam,
		flagged: flagParam,
	});

	it('normalizes a valid URL', () => {
		expect(validate({ from: '2026-08-03', status: 'closed', tags: ['t1'], flagged: true })).toEqual(
			{ from: '2026-08-03', status: 'closed', tags: ['t1'], flagged: true },
		);
	});

	it('drops defaults and junk instead of erroring', () => {
		expect(
			validate({ from: 'nonsense', status: 'open', tags: [], flagged: false, stray: 'x' }),
		).toEqual({});
	});
});

describe('countActiveFilters', () => {
	interface Filters {
		readonly from: string;
		readonly to: string;
		readonly status: 'all' | 'open' | 'closed';
		readonly tags: ReadonlySet<string>;
		readonly flagged: boolean;
	}

	const defaults: Filters = {
		from: '2026-07-01',
		to: '2026-08-03',
		status: 'open',
		tags: new Set(),
		flagged: false,
	};

	const counting = { groups: [['from', 'to']] } as const;

	it('counts nothing when every filter is at its default', () => {
		expect(countActiveFilters(defaults, { ...defaults }, counting)).toBe(0);
	});

	it('counts a multi-select by how many are selected', () => {
		expect(
			countActiveFilters(defaults, { ...defaults, tags: new Set(['a', 'b', 'c']) }, counting),
		).toBe(3);
	});

	it('counts a toggle only when it is on', () => {
		expect(countActiveFilters(defaults, { ...defaults, flagged: false }, counting)).toBe(0);
		expect(countActiveFilters(defaults, { ...defaults, flagged: true }, counting)).toBe(1);
	});

	it('counts a single-select away from its default as one', () => {
		expect(countActiveFilters(defaults, { ...defaults, status: 'open' }, counting)).toBe(0);
		expect(countActiveFilters(defaults, { ...defaults, status: 'closed' }, counting)).toBe(1);
	});

	it('counts a grouped date range once, whichever end moved', () => {
		expect(countActiveFilters(defaults, { ...defaults, from: '2026-01-01' }, counting)).toBe(1);
		expect(countActiveFilters(defaults, { ...defaults, to: '2026-12-31' }, counting)).toBe(1);
		expect(
			countActiveFilters(defaults, { ...defaults, from: '2026-01-01', to: '2026-12-31' }, counting),
		).toBe(1);
	});

	it('counts an ungrouped bound on its own', () => {
		expect(
			countActiveFilters(defaults, { ...defaults, from: '2026-01-01', to: '2026-12-31' }),
		).toBe(2);
	});

	it('adds the filters up', () => {
		expect(
			countActiveFilters(
				defaults,
				{
					from: '2026-01-01',
					to: '2026-12-31',
					status: 'all',
					tags: new Set(['a']),
					flagged: true,
				},
				counting,
			),
		).toBe(4);
	});

	it('skips a filter the surface declared uncounted', () => {
		expect(
			countActiveFilters(
				defaults,
				{ ...defaults, status: 'closed', flagged: true },
				{ ...counting, uncounted: ['status'] },
			),
		).toBe(1);
	});

	it('reads a set that equals its default as untouched', () => {
		const withTags: Filters = { ...defaults, tags: new Set(['a']) };
		expect(countActiveFilters(withTags, { ...withTags, tags: new Set(['a']) }, counting)).toBe(0);
	});
});

describe('useSearchFilters', () => {
	interface Filters {
		readonly from: string;
		readonly to: string;
		readonly status: 'all' | 'open' | 'closed';
		readonly tags: ReadonlySet<string>;
	}

	const DEFAULTS: Filters = {
		from: '2026-07-01',
		to: '2026-08-03',
		status: 'open',
		tags: new Set(),
	};

	const CODECS: FilterCodecs<Filters> = {
		from: dateParam,
		to: dateParam,
		status: choiceParam(['all', 'open', 'closed'] as const, 'open'),
		tags: idSetParam,
	};

	function bind(search: Record<string, unknown>) {
		router.search = search;
		router.navigate.mockClear();
		return renderHook(() => useSearchFilters(DEFAULTS, CODECS, DATE_RANGE_COUNTING));
	}

	/** What `reset` hands the router, applied to the params it was called on. */
	function resetOutcome(
		result: { current: { readonly reset: () => void } },
		previous: Record<string, unknown>,
	): Record<string, unknown> {
		result.current.reset();
		const [options] = router.navigate.mock.calls[0] as [
			{ readonly search: (previous: Record<string, unknown>) => Record<string, unknown> },
		];
		return options.search(previous);
	}

	it('counts what the URL carries', () => {
		const { result } = bind({ status: 'closed', tags: ['a', 'b'] });
		expect(result.current.activeCount).toBe(3);
	});

	it('counts nothing on a URL that carries no filter', () => {
		const { result } = bind({});
		expect(result.current.activeCount).toBe(0);
	});

	it('resets the filter params and leaves the rest of the URL alone', () => {
		const { result } = bind({ status: 'closed', tags: ['a'], page: 3 });
		expect(resetOutcome(result, { status: 'closed', tags: ['a'], page: 3 })).toEqual({ page: 3 });
	});

	it('counts nothing on what a reset leaves behind', () => {
		const { result } = bind({ status: 'closed', tags: ['a'], page: 3 });
		const { result: afterReset } = bind(resetOutcome(result, { status: 'closed', page: 3 }));
		expect(afterReset.current.activeCount).toBe(0);
	});
});
