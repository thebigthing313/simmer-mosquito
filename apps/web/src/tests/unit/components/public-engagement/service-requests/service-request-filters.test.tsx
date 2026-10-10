/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	type ServiceRequestFilterChipProps,
	ServiceRequestFilterChips,
} from '../../../../../components/public-engagement/service-requests/service-request-filters';

/**
 * The Map's Overdue chip (#1246): drawn while the filter is on and the
 * Organization's threshold is on, and not while the threshold is off.
 */

afterEach(cleanup);

function chips(overrides: Partial<ServiceRequestFilterChipProps>): ServiceRequestFilterChipProps {
	const dates = { from: '2026-01-01', to: '2026-10-20' };
	return {
		activeFilterCount: 1,
		availableTags: [],
		dateDefaults: dates,
		dates,
		onClearAll: () => {},
		regions: { options: [], nameById: new Map() } as never,
		search: '',
		selectedRegionIds: new Set(),
		selectedTagIds: new Set(),
		setDates: () => {},
		setSearch: () => {},
		setSelectedRegionIds: () => {},
		setSelectedTagIds: () => {},
		setStatus: () => {},
		status: 'all',
		overdue: true,
		overdueAvailable: true,
		setOverdue: () => {},
		...overrides,
	};
}

describe('ServiceRequestFilterChips', () => {
	it('draws an Overdue chip that turns the filter off', () => {
		const setOverdue = vi.fn();
		render(<ServiceRequestFilterChips {...chips({ setOverdue })} />);

		fireEvent.click(screen.getByRole('button', { name: 'Remove Overdue filter' }));

		expect(setOverdue).toHaveBeenCalledWith(false);
	});

	it('draws no Overdue chip while the threshold is off', () => {
		render(<ServiceRequestFilterChips {...chips({ overdueAvailable: false })} />);

		expect(screen.queryByText('Overdue')).toBeNull();
	});
});
