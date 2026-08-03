import { describe, expect, it } from 'vitest';
import {
	choiceParam,
	choiceSetParam,
	dateParam,
	flagParam,
	idSetParam,
	searchValidator,
	textParam,
} from './search-filters';

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
