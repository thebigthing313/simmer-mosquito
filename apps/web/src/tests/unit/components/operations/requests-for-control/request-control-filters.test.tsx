/** @vitest-environment jsdom */

/**
 * The Requests for Control chip bar against the binding it is handed (#1481).
 *
 * The Missions and Assignments chips are read through the whole route in
 * `worklist-date-chip.test.tsx`; this page had no suite over its chips. The
 * filter card used to take a defaults object the route built beside the one
 * `useSearchFilters` read, so the case worth holding is that the Dates chip
 * writes `binding.defaults` back, along with the status chip, which is the one
 * filter whose default is not empty.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestControlFilters } from '../../../../../components/operations/requests-for-control/request-control-filters';
import {
	type RequestFilterBinding,
	type RequestFilters,
	requestFilterDefaults,
} from '../../../../../hooks/operations/use-request-for-control-filter-state';

const TODAY = '2026-10-09';

afterEach(cleanup);

function renderWith(
	filters: Partial<RequestFilters>,
	activeCount: number,
): RequestFilterBinding['setFilters'] {
	const defaults = requestFilterDefaults(TODAY);
	const setFilters = vi.fn<RequestFilterBinding['setFilters']>();
	render(
		<RequestControlFilters
			binding={{
				filters: { ...defaults, ...filters },
				setFilters,
				reset: vi.fn(),
				activeCount,
				defaults,
				today: TODAY,
			}}
			nameById={new Map()}
			personnelOptions={[]}
		/>,
	);
	return setFilters;
}

describe('RequestControlFilters', () => {
	it('opens on the open requests over the last ninety days and draws no chip bar', () => {
		expect(requestFilterDefaults(TODAY)).toMatchObject({
			from: '2026-07-12',
			to: TODAY,
			status: 'open',
			unassigned: false,
		});

		renderWith({}, 0);

		expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
	});

	it('writes binding.defaults back when the Dates chip is removed', () => {
		const setFilters = renderWith({ from: '2026-01-01', to: '2026-02-01' }, 1);

		fireEvent.click(screen.getByRole('button', { name: /^Remove Dates: .* filter$/ }));

		expect(setFilters).toHaveBeenCalledWith({ from: '2026-07-12', to: TODAY });
	});

	it('puts the status back on open when its chip is removed', () => {
		const setFilters = renderWith({ status: 'resolved' }, 1);

		fireEvent.click(screen.getByRole('button', { name: 'Remove Status: Resolved filter' }));

		expect(setFilters).toHaveBeenCalledWith({ status: 'open' });
	});
});
