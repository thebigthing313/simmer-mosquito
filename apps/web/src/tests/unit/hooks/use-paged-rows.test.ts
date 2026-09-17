/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePagedRows } from '../../../hooks/use-paged-rows';

afterEach(cleanup);

/**
 * Client paging over rows a card already holds, written twice with two clamps
 * before #865 settled it.
 *
 * The cases that separate the two are the last two: the clamp is computed in
 * render and never written back, so a set that shrinks under the reader and
 * then syncs back returns them to the page they were on. The effect version
 * this replaced stored the clamp, which forgot it.
 */

const rowsOf = (count: number): readonly number[] => Array.from({ length: count }, (_, i) => i);

const paged = (rows: readonly number[], resetKey?: string) =>
	renderHook(({ rows: current, key }) => usePagedRows(current, { pageSize: 10, resetKey: key }), {
		initialProps: { rows, key: resetKey },
	});

describe('usePagedRows', () => {
	it('cuts the rows to the page in view', () => {
		const { result } = paged(rowsOf(25));

		expect(result.current.pageCount).toBe(3);
		expect(result.current.pageRows).toEqual(rowsOf(10));

		act(() => result.current.setPage(2));
		expect(result.current.pageRows).toEqual([20, 21, 22, 23, 24]);
	});

	// One page, not zero: a card with nothing in it is on the only page it has.
	it('counts one page for no rows at all', () => {
		const { result } = paged([]);

		expect(result.current.pageCount).toBe(1);
		expect(result.current.page).toBe(0);
	});

	it('goes back to the first page when the card is pointed at another record', () => {
		const view = paged(rowsOf(25), 'trap-1');

		act(() => view.result.current.setPage(2));
		view.rerender({ rows: rowsOf(25), key: 'trap-2' });

		expect(view.result.current.page).toBe(0);
	});

	it('clamps into range when the rows shrink underneath the reader', () => {
		const view = paged(rowsOf(25));

		act(() => view.result.current.setPage(2));
		view.rerender({ rows: rowsOf(12), key: undefined });

		expect(view.result.current.page).toBe(1);
		expect(view.result.current.pageRows).toEqual([10, 11]);
	});

	it('returns the reader to the page they asked for when the rows come back', () => {
		const view = paged(rowsOf(25));

		act(() => view.result.current.setPage(2));
		view.rerender({ rows: rowsOf(12), key: undefined });
		view.rerender({ rows: rowsOf(25), key: undefined });

		expect(view.result.current.page).toBe(2);
	});
});
