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
				<ExplorerRow
					detailLabel="View details for Kendall Park"
					detailLink={DETAIL}
					isSelected={false}
					onSelect={() => {}}
					selectLabel="Show Kendall Park on the map"
					title="Kendall Park"
				/>
			</ul>,
		);

		expect(screen.getByRole('button', { name: 'Show Kendall Park on the map' })).toBeTruthy();
	});

	// A weather station whose centroid has not synced has nothing to show, and a
	// control that does nothing is worse than no control.
	it('draws no map control for a record with no coordinates', () => {
		render(
			<ul>
				<ExplorerRow
					detailLabel="View details for Kendall Park"
					detailLink={DETAIL}
					isSelected={false}
					selectLabel="Show Kendall Park on the map"
					title="Kendall Park"
				/>
			</ul>,
		);

		expect(screen.queryByRole('button', { name: 'Show Kendall Park on the map' })).toBeNull();
		// The record is still reachable: only the camera move is gone.
		expect(screen.getByLabelText('View details for Kendall Park')).toBeTruthy();
		expect(screen.getByText('Kendall Park')).toBeTruthy();
	});
});
