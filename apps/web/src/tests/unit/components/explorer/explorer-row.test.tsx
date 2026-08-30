/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

const { ExplorerRow } = await import('../../../../components/explorer/explorer-row');

afterEach(cleanup);

const DETAIL = { to: '/gis/weather/$id', params: { id: 'w1' } } as never;

describe('ExplorerRow', () => {
	it('offers the map control when the record has somewhere to fly to', () => {
		render(
			<ul>
				<li>
					<ExplorerRow
						detailLabel="View details for Kendall Park"
						detailLink={DETAIL}
						isSelected={false}
						onSelect={() => {}}
						selectLabel="Show Kendall Park on the map"
						title="Kendall Park"
					/>
				</li>
			</ul>,
		);

		expect(screen.getByRole('button', { name: 'Show Kendall Park on the map' })).toBeTruthy();
	});

	// The badge column and the title column were competing for a 380px rail, and
	// on the rich surfaces the badges won outright: an inspection's density pill
	// plus its life-stage strip is 175px, which left the title at zero and drew a
	// row with no record name on it at all.
	it('puts the badges under the title on a dated row and beside it otherwise', () => {
		const { container, rerender } = render(
			<ul>
				<li>
					<ExplorerRow
						badges={<span>Very heavy</span>}
						date="Aug 12, 2026"
						detailLabel="View details"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show on the map"
						title="CAR - S1 - 12"
					/>
				</li>
			</ul>,
		);
		// Stacked: the badge sits inside the block the title heads, not in a column
		// of its own after it.
		const title = screen.getByText('CAR - S1 - 12');
		expect(title.parentElement?.contains(screen.getByText('Very heavy'))).toBe(true);

		rerender(
			<ul>
				<li>
					<ExplorerRow
						badges={<span>Very heavy</span>}
						detailLabel="View details"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show on the map"
						title="CAR - S1 - 12"
					/>
				</li>
			</ul>,
		);
		expect(
			screen.getByText('CAR - S1 - 12').parentElement?.contains(screen.getByText('Very heavy')),
		).toBe(false);
		expect(container.textContent).toContain('Very heavy');
	});

	// `Aug 12, 2026` on one line needs 88px of a 380px rail to carry a year that
	// is the same for every record in a 30-day window.
	it('stacks the year under the day, and leaves a date with no year alone', () => {
		const { rerender } = render(
			<ul>
				<li>
					<ExplorerRow
						date="Aug 12, 2026"
						detailLabel="View details"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show on the map"
						title="CAR - S1 - 12"
					/>
				</li>
			</ul>,
		);
		expect(screen.getByText('Aug 12')).toBeTruthy();
		expect(screen.getByText('2026')).toBeTruthy();

		// The overview panels pass a day with no year, and `—` stands in for a date
		// that would not parse. Neither has a comma to split on.
		rerender(
			<ul>
				<li>
					<ExplorerRow
						date="Aug 12"
						detailLabel="View details"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show on the map"
						title="CAR - S1 - 12"
					/>
				</li>
			</ul>,
		);
		expect(screen.getByText('Aug 12')).toBeTruthy();
		expect(screen.queryByText('2026')).toBeNull();
	});

	// A weather station whose centroid has not synced has nothing to show, and a
	// control that does nothing is worse than no control.
	it('draws no map control for a record with no coordinates', () => {
		render(
			<ul>
				<li>
					<ExplorerRow
						detailLabel="View details for Kendall Park"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show Kendall Park on the map"
						title="Kendall Park"
					/>
				</li>
			</ul>,
		);

		expect(screen.queryByRole('button', { name: 'Show Kendall Park on the map' })).toBeNull();
		// The record is still reachable: only the camera move is gone.
		expect(screen.getByLabelText('View details for Kendall Park')).toBeTruthy();
		expect(screen.getByText('Kendall Park')).toBeTruthy();
	});
});
