// @vitest-environment jsdom

/**
 * The two directions `ScrollArea` scrolls in (#1258).
 *
 * The vertical default flattens Radix's `display: table` content wrapper to a
 * block, because a table sizes to its widest row and pushed truncating result
 * rows past the edge of every explorer (#1081). A sideways scroller needs that
 * table back, since a block never grows wider than the viewport and so never
 * gives the horizontal bar anything to scroll. The first two cases pin which
 * bar is drawn, which axis the viewport lets overflow, and whether the wrapper
 * is flattened; the third pins the `min-w-0` that stops wide content from
 * widening a flex or grid column instead of scrolling inside it.
 *
 * `type="always"` is what makes a bar render in jsdom at all: the default
 * `hover` type mounts a bar only once the pointer enters the root.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScrollArea } from '../../../../components/ui/scroll-area';

/** Radix's scrollbar measures its viewport, and jsdom ships no observer. */
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

afterEach(cleanup);

const classesOf = (element: Element | null): string[] =>
	(element?.getAttribute('class') ?? '').split(/\s+/);

function renderScrollArea(props: Partial<Parameters<typeof ScrollArea>[0]> = {}) {
	const { container } = render(
		<ScrollArea type="always" {...props}>
			<p>Content</p>
		</ScrollArea>,
	);
	const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
	const bars = [...container.querySelectorAll('[data-slot="scroll-area-scrollbar"]')];
	return {
		root: container.querySelector('[data-slot="scroll-area"]'),
		viewport,
		bars: bars.map((bar) => bar.getAttribute('data-orientation')),
		wrapper: viewport?.firstElementChild ?? null,
	};
}

describe('ScrollArea', () => {
	it('scrolls vertically by default, with the content wrapper flattened to a block', () => {
		const { bars, viewport, wrapper } = renderScrollArea();

		expect(bars).toEqual(['vertical']);
		expect(viewport?.style.overflowY).toBe('scroll');
		expect(viewport?.style.overflowX).toBe('hidden');
		expect(classesOf(viewport)).toContain('[&>div]:!block');
		expect(wrapper?.getAttribute('style')).toContain('display: table');
	});

	it('scrolls sideways when asked, with the table-sized wrapper left in place', () => {
		const { bars, viewport, wrapper } = renderScrollArea({ orientation: 'horizontal' });

		expect(bars).toEqual(['horizontal']);
		expect(viewport?.style.overflowX).toBe('scroll');
		expect(viewport?.style.overflowY).toBe('hidden');
		expect(classesOf(viewport)).not.toContain('[&>div]:!block');
		expect(wrapper?.getAttribute('style')).toContain('display: table');
	});

	it('lets a sideways scroller shrink inside a flex or grid parent', () => {
		const { root } = renderScrollArea({ orientation: 'horizontal' });

		expect(classesOf(root)).toContain('min-w-0');
	});
});
