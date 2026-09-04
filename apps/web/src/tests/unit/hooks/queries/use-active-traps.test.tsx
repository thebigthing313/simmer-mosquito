/** @vitest-environment jsdom */

/**
 * Adult surveillance's read: the traps the agency is running now.
 *
 * The sort is the part worth holding. It is by code then by name, which is the
 * order `trapDisplayName` composes them in, and it replaced a `localeCompare`
 * over the composed label. Case folding went with it, deliberately, so a
 * lowercase code sorts after every uppercase one.
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

	it('folds case, which is not what the hook says it does', async () => {
		// The module comment says case folding went with the `localeCompare` it
		// replaced, so "a lowercase code sorts after every uppercase one". The
		// engine's string comparison is collation-aware, so it does not: `a-1`
		// still sorts before `Z-1`, exactly as the old JS sort had it. Nothing on
		// screen is wrong, but the note is, and it is the note somebody would read
		// before deciding a folded column was needed.
		// Seeded uppercase first, so passing means the rows were compared rather
		// than left in arrival order.
		seedRows(traps, [trap('t1', { trap_code: 'Z-1' }), trap('t2', { trap_code: 'a-1' })]);

		const { result } = await renderRead(() => useActiveTraps());

		expect(result.current.traps.map((row) => row.trapCode)).toEqual(['a-1', 'Z-1']);
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
