/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServiceRequestsFilterBar } from '../../../../../components/public-engagement/service-requests/service-requests-filter-bar';
import {
	type ServiceRequestFilters,
	serviceRequestRecordSet,
} from '../../../../../components/public-engagement/service-requests/service-requests-search';
import { recordSetBinding, recordSetContext } from '../../explorer/record-set-binding';

/**
 * The Table's Overdue control (#1246): drawn while the Organization's threshold
 * is on, with a chip that undoes it, and not drawn at all while it is off.
 */

afterEach(cleanup);

function renderBar(patch: Partial<ServiceRequestFilters>, overdueAvailable: boolean) {
	const binding = recordSetBinding(
		serviceRequestRecordSet,
		'table',
		patch,
		recordSetContext(overdueAvailable ? 14 : 'off'),
	);
	render(<ServiceRequestsFilterBar binding={binding} onOrderChange={() => {}} order="newest" />);
	return binding.setFilters;
}

describe('ServiceRequestsFilterBar', () => {
	it('turns Overdue on', () => {
		const setFilters = renderBar({}, true);

		fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));

		expect(setFilters).toHaveBeenCalledWith({ overdue: true });
	});

	it('draws a chip that turns Overdue off', () => {
		const setFilters = renderBar({ overdue: true }, true);

		fireEvent.click(screen.getByRole('button', { name: 'Remove Overdue filter' }));

		expect(setFilters).toHaveBeenCalledWith({ overdue: false });
	});

	it('draws no Overdue control and no chip while the threshold is off', () => {
		renderBar({ overdue: true }, false);

		expect(screen.queryByRole('button', { name: 'Overdue' })).toBeNull();
		expect(screen.queryByText('Overdue')).toBeNull();
	});
});
