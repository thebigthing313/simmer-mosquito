/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHeldRows } from '../../../../hooks/explorer/use-held-rows';
import type { InspectionTableRow } from '../../../../hooks/queries/larval-activity-view';

/**
 * Widening the window never flashes an empty table. The live query is rebuilt
 * on a new limit and reports not-ready until it answers, and what is on
 * screen stays until then. The cache used to be a ref written during render,
 * which the compiler refuses; it is state now, and these are the four reads
 * the ref answered (#1184).
 */

function row(id: string): InspectionTableRow {
	return { id } as InspectionTableRow;
}

const FIRST = [row('a'), row('b')];
const WIDER = [row('a'), row('b'), row('c')];

interface Props {
	readonly rows: readonly InspectionTableRow[];
	readonly isReady: boolean;
	readonly windowKey: string;
}

function renderHeld(initial: Props) {
	return renderHook(
		({ rows, isReady, windowKey }: Props) => useHeldRows(rows, isReady, windowKey),
		{ initialProps: initial },
	);
}

describe('the rows held through a wider window', () => {
	it('are the live rows while the query is ready', () => {
		const held = renderHeld({ rows: FIRST, isReady: true, windowKey: 'sort|limit=50' });
		expect(held.result.current).toBe(FIRST);
	});

	it('stay on screen while the wider window is not ready, then give way to it', () => {
		const held = renderHeld({ rows: FIRST, isReady: true, windowKey: 'sort|limit=50' });
		held.rerender({ rows: [], isReady: false, windowKey: 'sort|limit=50' });
		expect(held.result.current).toBe(FIRST);
		held.rerender({ rows: WIDER, isReady: true, windowKey: 'sort|limit=50' });
		expect(held.result.current).toBe(WIDER);
	});

	it('are none under a new sort or filter, which is a different window', () => {
		const held = renderHeld({ rows: FIRST, isReady: true, windowKey: 'date|limit=50' });
		held.rerender({ rows: [], isReady: false, windowKey: 'habitat|limit=50' });
		expect(held.result.current).toEqual([]);
	});

	it('hand back one empty array rather than a new one each render', () => {
		const held = renderHeld({ rows: FIRST, isReady: true, windowKey: 'date|limit=50' });
		held.rerender({ rows: [], isReady: false, windowKey: 'habitat|limit=50' });
		const first = held.result.current;
		held.rerender({ rows: [], isReady: false, windowKey: 'habitat|limit=50' });
		expect(held.result.current).toBe(first);
	});
});
