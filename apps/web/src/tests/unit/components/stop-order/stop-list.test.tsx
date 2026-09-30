/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StopList } from '../../../../components/stop-order';

/**
 * The ordered-stop list's frame. Every stop list in the app draws through it,
 * the mission, the assignment plan and the habitat route editor among them, so
 * the scroller is asserted once here rather than on each page.
 */
afterEach(cleanup);

const EMPTY = { title: 'No Stops Yet', description: 'Add some.' };

describe('StopList', () => {
	it('scrolls its stops inside the styled viewport, as a flex item of the pane', () => {
		render(
			<StopList empty={EMPTY} isEmpty={false} isLoading={false}>
				<li>First stop</li>
				<li>Second stop</li>
			</StopList>,
		);

		const list = screen.getByRole('list');
		const viewport = list.closest('[data-slot="scroll-area-viewport"]');
		expect(viewport).not.toBeNull();
		expect(viewport?.parentElement?.getAttribute('class')?.split(/\s+/)).toEqual(
			expect.arrayContaining(['min-h-0', 'flex-1']),
		);
		expect(list.className).not.toContain('overflow-y-auto');
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
	});

	it('draws the empty state in place of a scroller', () => {
		render(
			<StopList empty={EMPTY} isEmpty isLoading={false}>
				{null}
			</StopList>,
		);

		expect(screen.getByText('No Stops Yet')).toBeTruthy();
		expect(document.querySelector('[data-slot="scroll-area"]')).toBeNull();
	});
});
