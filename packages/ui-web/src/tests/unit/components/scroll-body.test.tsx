// @vitest-environment jsdom

/**
 * `ScrollBody` owns the three ways a scroll region gets a height and the room
 * it leaves for the bar (#1283).
 *
 * jsdom lays nothing out, so these cases read the classes and the custom
 * property the rules are written in. The cap is on the viewport because Radix
 * scrolls the viewport, and a capped root clips its content instead.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScrollBody, type ScrollBodyHeight } from '../../../components/scroll-body';

afterEach(cleanup);

const VIEWPORT = '[&>[data-slot=scroll-area-viewport]]:';

const renderBody = (props: { height?: ScrollBodyHeight; gutter?: boolean; className?: string }) => {
	const { container } = render(
		<ScrollBody {...props}>
			<p>rows</p>
		</ScrollBody>,
	);
	const root = container.querySelector<HTMLElement>('[data-slot="scroll-area"]');
	const viewport = root?.querySelector('[data-slot="scroll-area-viewport"]');
	return { root, viewport, classes: (root?.getAttribute('class') ?? '').split(/\s+/) };
};

describe('ScrollBody', () => {
	it('draws its content inside the scroll area viewport', () => {
		const { viewport } = renderBody({});

		expect(viewport?.contains(screen.getByText('rows'))).toBe(true);
	});

	it('puts a cap on the viewport through a custom property, not on the root', () => {
		const { root, classes } = renderBody({ height: { cap: 'calc(90vh - 13rem)' } });

		expect(root?.style.getPropertyValue('--scroll-body-cap')).toBe('calc(90vh - 13rem)');
		expect(classes).toContain(`${VIEWPORT}max-h-(--scroll-body-cap)`);
		expect(classes.some((name) => name.startsWith('max-h'))).toBe(false);
	});

	it('lets a shrinking body and its viewport shrink as flex items', () => {
		const { root, classes } = renderBody({ height: 'shrink' });

		expect(classes).toEqual(
			expect.arrayContaining([
				'flex',
				'flex-col',
				'min-h-0',
				`${VIEWPORT}min-h-0`,
				`${VIEWPORT}flex-1`,
			]),
		);
		expect(root?.style.getPropertyValue('--scroll-body-cap')).toBe('');
	});

	it('holds the content wrapper to the viewport height when it fills a pane', () => {
		const { classes } = renderBody({ height: 'fill' });

		expect(classes).toContain('[&>[data-slot=scroll-area-viewport]>div]:h-full');
		expect(classes).not.toContain('flex');
	});

	it('reserves room for the bar unless the gutter is turned off', () => {
		expect(renderBody({}).classes).toContain(`${VIEWPORT}pr-3`);
		cleanup();
		expect(renderBody({ gutter: false }).classes).not.toContain(`${VIEWPORT}pr-3`);
	});

	it('keeps a caller class on the root', () => {
		const { classes } = renderBody({ height: 'shrink', className: 'flex-1' });

		expect(classes).toContain('flex-1');
	});
});
