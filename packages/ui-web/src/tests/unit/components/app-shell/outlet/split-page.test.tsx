// @vitest-environment jsdom

/**
 * The content column scrolls inside the shared `ScrollArea`, so a long column
 * draws the styled bar rather than the browser's own (#1255).
 *
 * Two things the column held before the move have to survive it. The `fields`
 * container a record form's field grids query sits on the scroll area's root,
 * the element whose width is the column's. And most callers hand the column a
 * `flex h-full min-h-0 flex-col` that scrolls a region of its own, which needs
 * a parent of definite height: Radix wraps the content in a div of its own
 * inside the viewport, so that div is held to the viewport's height, or every
 * one of those columns grows to its content and scrolls as a whole instead.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SplitPage } from '../../../../../components/app-shell/outlet/split-page';

/** Radix's scrollbar measures its viewport, and jsdom ships no observer. */
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

afterEach(cleanup);

const classesOf = (element: Element | null | undefined): string[] =>
	(element?.getAttribute('class') ?? '').split(/\s+/);

const renderSplit = () =>
	render(
		<SplitPage aside={<div>map</div>}>
			<p>column</p>
		</SplitPage>,
	);

describe('SplitPage', () => {
	it('scrolls the content column inside a scroll area that is the fields container', () => {
		const { container } = renderSplit();
		const root = container.querySelector('[data-slot="scroll-area"]');
		const viewport = root?.querySelector('[data-slot="scroll-area-viewport"]');

		expect(viewport?.contains(screen.getByText('column'))).toBe(true);
		expect(viewport?.contains(screen.getByText('map'))).toBe(false);
		expect(classesOf(root)).toContain('@container/fields');
		expect(container.querySelector('.overflow-y-auto')).toBeNull();
	});

	it('holds the content wrapper to the viewport height, so an h-full column fills it', () => {
		const { container } = renderSplit();
		const root = container.querySelector('[data-slot="scroll-area"]');

		expect(classesOf(root)).toContain('[&>[data-slot=scroll-area-viewport]>div]:h-full');
	});
});
