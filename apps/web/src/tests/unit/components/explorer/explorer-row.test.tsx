/** @vitest-environment jsdom */
import { mapLifecycle } from '@simmer-mosquito/design-tokens';
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

	// A record kind with nothing to draw used to arrive as an empty fragment,
	// which is not `undefined`, so a dated row still laid out the stacked line
	// under its subtitle and an undated one the inline column beside the title.
	// The caller passes nothing now, and nothing is what the row draws (#1107).
	it('draws no badge container, stacked or inline, when there are no badges', () => {
		const { rerender } = render(
			<ul>
				<li>
					<ExplorerRow
						date="Aug 12, 2026"
						detailLabel="View details"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show on the map"
						subtitle="Backpack sprayer"
						title="Altosid"
					/>
				</li>
			</ul>,
		);
		// The title block holds the title and the subtitle and no line under them.
		const titleBlock = screen.getByText('Altosid').parentElement;
		expect(titleBlock?.querySelector('div')).toBeNull();
		expect(titleBlock?.lastElementChild?.textContent).toBe('Backpack sprayer');

		rerender(
			<ul>
				<li>
					<ExplorerRow
						detailLabel="View details"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show on the map"
						subtitle="Backpack sprayer"
						title="Altosid"
					/>
				</li>
			</ul>,
		);
		// Undated, the chevron follows the title block directly: no inline column
		// sits between them.
		const chevron = screen.getByLabelText('View details');
		expect(chevron.previousElementSibling?.contains(screen.getByText('Altosid'))).toBe(true);
		expect(screen.getByText('Altosid').parentElement?.querySelector('div')).toBeNull();
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

	// A `title` paints a hover tooltip and is a weak source for an accessible
	// name, so the dot names itself with `aria-label` and nothing else.
	it('names the map-colour dot with a label, not a tooltip', () => {
		render(
			<ul>
				<li>
					<ExplorerRow
						detailLabel="View details"
						detailLink={DETAIL}
						isSelected={false}
						selectLabel="Show on the map"
						swatch={{ color: mapLifecycle.inaccessible, label: 'Inaccessible' }}
						title="CAR - S1 - 12"
					/>
				</li>
			</ul>,
		);

		const dot = screen.getByRole('img', { name: 'Inaccessible' });
		expect(dot.getAttribute('title')).toBeNull();
	});

	// The nearby list on a service request is the caller: every row there is a
	// distance from the request, and a list where one row said it and the next
	// did not would read as two kinds of record.
	it('draws the distance in a slot of its own, reserved for a row without one', () => {
		const { rerender } = render(
			<ul>
				<li>
					<ExplorerRow
						date="Aug 12, 2026"
						detailLabel="View details"
						detailLink={DETAIL}
						distance="328 ft"
						isSelected={false}
						selectLabel="Show on the map"
						title="CAR - S1 - 12"
					/>
				</li>
			</ul>,
		);
		const distance = screen.getByText('328 ft');
		// Its own column, not a word in the title block: the chevron is its next
		// sibling and the title is not its parent.
		expect(distance.nextElementSibling?.getAttribute('aria-label')).toBe('View details');
		expect(screen.getByText('CAR - S1 - 12').parentElement?.contains(distance)).toBe(false);

		rerender(
			<ul>
				<li>
					<ExplorerRow
						date="Aug 12, 2026"
						detailLabel="View details"
						detailLink={DETAIL}
						distance={null}
						isSelected={false}
						selectLabel="Show on the map"
						title="CAR - S1 - 12"
					/>
				</li>
			</ul>,
		);
		// Null keeps the column, so the chevrons line up down a list where some
		// rows have a distance and some do not: the chevron's previous sibling is
		// still the empty slot rather than the title block.
		const chevron = screen.getByLabelText('View details');
		expect(chevron.previousElementSibling?.textContent).toBe('');
		expect(chevron.previousElementSibling?.contains(screen.getByText('CAR - S1 - 12'))).toBe(false);

		rerender(
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
		// Omitted, and a list that never says a distance gets the width back.
		expect(
			screen
				.getByLabelText('View details')
				.previousElementSibling?.contains(screen.getByText('CAR - S1 - 12')),
		).toBe(true);
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
