/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ServiceRequestsFilterBar,
	type ServiceRequestTableFilters,
} from '../../../../../components/public-engagement/service-requests/service-requests-filter-bar';

/**
 * The Table's Overdue control (#1246): drawn while the Organization's threshold
 * is on, with a chip that undoes it, and not drawn at all while it is off.
 */

afterEach(cleanup);

const DEFAULTS: ServiceRequestTableFilters = {
	status: 'all',
	from: '2026-01-01',
	to: '2026-10-20',
	overdue: false,
};

function renderBar(
	filters: ServiceRequestTableFilters,
	overdueAvailable: boolean,
	activeCount: number,
) {
	const setFilters = vi.fn();
	render(
		<ServiceRequestsFilterBar
			activeCount={activeCount}
			defaults={DEFAULTS}
			filters={filters}
			onClearAll={() => {}}
			onOrderChange={() => {}}
			order="newest"
			overdueAvailable={overdueAvailable}
			setFilters={setFilters}
			today="2026-10-20"
		/>,
	);
	return setFilters;
}

describe('ServiceRequestsFilterBar', () => {
	it('turns Overdue on', () => {
		const setFilters = renderBar(DEFAULTS, true, 0);

		fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));

		expect(setFilters).toHaveBeenCalledWith({ overdue: true });
	});

	it('draws a chip that turns Overdue off', () => {
		const setFilters = renderBar({ ...DEFAULTS, overdue: true }, true, 1);

		fireEvent.click(screen.getByRole('button', { name: 'Remove Overdue filter' }));

		expect(setFilters).toHaveBeenCalledWith({ overdue: false });
	});

	it('draws no Overdue control and no chip while the threshold is off', () => {
		renderBar({ ...DEFAULTS, overdue: true }, false, 0);

		expect(screen.queryByRole('button', { name: 'Overdue' })).toBeNull();
		expect(screen.queryByText('Overdue')).toBeNull();
	});
});
