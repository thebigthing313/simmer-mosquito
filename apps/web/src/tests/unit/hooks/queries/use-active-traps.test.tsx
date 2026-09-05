/** @vitest-environment jsdom */

/**
 * Adult surveillance's read: the traps the agency is running now.
 *
 * The sort is the part worth holding. It is by code then by name, which is the
 * order `trapDisplayName` composes them in, and it replaced a `localeCompare`
 * over the composed label. It still compares that way: the engine's ascending
 * comparator calls `localeCompare` whenever `stringSort` is `locale`, which is
 * the collection default. The two cases here are the folded one and the trap
 * that has neither field to sort by.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useActiveTraps } from '../../../../hooks/queries/use-active-traps';
import { collection_methods } from '../../../../lib/collections/collection_methods';
import { traps } from '../../../../lib/collections/traps';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

function trap(
	id: string,
	overrides: {
		readonly trap_code?: string | null;
		readonly trap_name?: string | null;
		readonly is_active?: boolean;
		readonly collection_method_id?: string;
	} = {},
) {
	return {
		id,
		trap_code: null,
		trap_name: null,
		description: null,
		is_active: true,
		collection_method_id: 'm1',
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(collection_methods, [{ id: 'm1', name: 'CO2 light trap' }]);
});

describe('useActiveTraps', () => {
	it('names the collection method through the join', async () => {
		seedRows(traps, [trap('t1', { trap_code: 'A-1' })]);

		const { result } = await renderRead(() => useActiveTraps());

		expect(result.current.traps[0]?.methodName).toBe('CO2 light trap');
	});

	it('keeps a trap whose method was retired, under a stand-in name', async () => {
		// The `left` join is what does that. An `inner` would take the trap off the
		// directory because its catalog row went, which is the wrong record to lose.
		seedRows(traps, [trap('t1', { trap_code: 'A-1', collection_method_id: 'gone' })]);

		const { result } = await renderRead(() => useActiveTraps());

		expect(result.current.traps.map((row) => row.methodName)).toEqual(['Unknown method']);
	});

	it('sorts by code, and by name for a trap with no code', async () => {
		seedRows(traps, [
			trap('t1', { trap_code: 'C-1' }),
			trap('t2', { trap_name: 'Almond Grove' }),
			trap('t3', { trap_code: 'A-9' }),
		]);

		const { result } = await renderRead(() => useActiveTraps());

		expect(result.current.traps.map((row) => row.id)).toEqual(['t3', 't2', 't1']);
	});

	it('sorts a trap that has both by its code, not by its name', async () => {
		seedRows(traps, [
			trap('t1', { trap_code: 'B-2', trap_name: 'Aardvark' }),
			trap('t2', { trap_code: 'A-1', trap_name: 'Zebra' }),
		]);

		const { result } = await renderRead(() => useActiveTraps());

		expect(result.current.traps.map((row) => row.id)).toEqual(['t2', 't1']);
	});

	it('folds case, because the comparator is collation-aware', async () => {
		// `stringSort` defaults to `locale` on a collection and the clause does not
		// override it, so the ascending comparator calls `localeCompare` and `a-1`
		// sorts before `Z-1`. This is the assertion the module comment points at,
		// and it is what makes a folded column unnecessary.
		// Seeded uppercase first, so passing means the rows were compared rather
		// than left in arrival order.
		seedRows(traps, [trap('t1', { trap_code: 'Z-1' }), trap('t2', { trap_code: 'a-1' })]);

		const { result } = await renderRead(() => useActiveTraps());

		expect(result.current.traps.map((row) => row.trapCode)).toEqual(['a-1', 'Z-1']);
	});

	it('puts a trap with neither a code nor a name at the head of the list', async () => {
		// `coalesce` yields no value for such a trap and `orderBy` defaults `nulls`
		// to `first`, so it sorts ahead of every trap that has something to sort
		// by rather than by the short id it reads as. Two of them, so the
		// assertion is about where the group lands and not about one row.
		seedRows(traps, [
			trap('t1', { trap_code: 'A-1' }),
			trap('t2'),
			trap('t3', { trap_name: 'Almond Grove' }),
			trap('t4'),
		]);

		const { result } = await renderRead(() => useActiveTraps());

		const ids = result.current.traps.map((row) => row.id);
		expect([...ids.slice(0, 2)].sort()).toEqual(['t2', 't4']);
		expect(ids.slice(2)).toEqual(['t1', 't3']);
	});

	it('leaves a retired trap out in the predicate rather than after the fact', async () => {
		seedRows(traps, [
			trap('t1', { trap_code: 'A-1' }),
			trap('t2', { trap_code: 'B-1', is_active: false }),
		]);

		const { result } = await renderRead(() => useActiveTraps());

		expect(result.current.traps.map((row) => row.id)).toEqual(['t1']);
	});
});
