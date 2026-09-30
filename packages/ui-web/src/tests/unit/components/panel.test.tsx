// @vitest-environment jsdom

/**
 * A panel that caps its body scrolls it inside the shared `ScrollArea`, so a
 * long list draws the styled bar rather than the browser's own (#1255).
 *
 * Radix puts the overflow on an inner viewport, and the viewport's `h-full`
 * resolves to nothing against a root with no height of its own, so a cap on
 * the root clips the list rather than scrolling it. The cap is a `ScrollBody`
 * cap, which that part holds on the viewport (#1283), and a panel without
 * `scrollBody` gets no scroll area.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Panel } from '../../../components/panel';

afterEach(cleanup);

const renderPanel = (scrollBody: boolean) =>
	render(
		<Panel icon={null} scrollBody={scrollBody} title="Source Reductions">
			<p>rows</p>
		</Panel>,
	);

describe('Panel', () => {
	it('scrolls a capped body inside a scroll area whose viewport holds the cap', () => {
		const { container } = renderPanel(true);
		const root = container.querySelector<HTMLElement>('[data-slot="scroll-area"]');
		const viewport = root?.querySelector('[data-slot="scroll-area-viewport"]');

		expect(viewport?.contains(screen.getByText('rows'))).toBe(true);
		expect(root?.style.getPropertyValue('--scroll-body-cap')).toBe('19rem');
		expect(container.querySelector('.overflow-y-auto')).toBeNull();
	});

	it('draws an uncapped body with no scroll area', () => {
		const { container } = renderPanel(false);

		expect(container.querySelector('[data-slot="scroll-area"]')).toBeNull();
		expect(screen.getByText('rows')).toBeTruthy();
	});
});
