import { expect } from 'vitest';

/**
 * Asserts that a table scrolls sideways inside the styled `ScrollArea` (#1260).
 *
 * The table's own Radix viewport has to let the x axis overflow, which is what
 * `orientation="horizontal"` sets, and nothing around the `ScrollArea` root may
 * scroll sideways too, since a native scroller outside it would draw the
 * browser's bar under the styled one. The shared `Table` keeps its generated
 * `overflow-x-auto` container inside the viewport; that one sits in the
 * table-sized content wrapper, grows with the table and never overflows.
 */
export function expectSidewaysScroller(table: Element): void {
	const viewport = table.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
	expect(viewport, 'the table scrolls inside a ScrollArea').not.toBeNull();
	expect(viewport?.style.overflowX).toBe('scroll');

	const root = viewport?.closest('[data-slot="scroll-area"]') ?? null;
	for (let node = root?.parentElement ?? null; node !== null; node = node.parentElement) {
		const classes = (node.getAttribute('class') ?? '').split(/\s+/);
		expect(classes, 'no sideways scroller wraps the ScrollArea').not.toContain('overflow-x-auto');
		expect(classes, 'no sideways scroller wraps the ScrollArea').not.toContain('overflow-auto');
	}
}
