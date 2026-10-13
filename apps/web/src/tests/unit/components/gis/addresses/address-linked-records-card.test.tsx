/** @vitest-environment jsdom */

/**
 * The Linked Records card's states before it has rows to draw: the reader is
 * told when nothing names the Address, and a failed read is never that.
 *
 * The rows and the tabs they sit under are links, so their cases are in
 * `link-destinations.test.tsx`, which builds the router they need.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinkedRecordsRead } from '../../../../../components/gis/addresses/address-linked-records';
import { LinkedRecordsBody } from '../../../../../components/gis/addresses/address-linked-records-card';
import { createOrganizationClock } from '../../../../../lib/organization-clock';

afterEach(cleanup);

const lookups = { nameById: new Map(), formatQuantity: String, tagById: new Map() };
const clock = createOrganizationClock('America/New_York');

function renderBody(read: Partial<LinkedRecordsRead>): void {
	render(
		<LinkedRecordsBody
			clock={clock}
			lookups={lookups}
			read={{
				data: undefined,
				isLoading: false,
				isError: false,
				refetch: () => Promise.resolve(),
				...read,
			}}
		/>,
	);
}

describe('the Linked Records card', () => {
	it('says no records name the address when every family is empty', () => {
		renderBody({
			data: {
				addressId: 'address-1',
				families: [
					{ family: 'requests', total: 0, items: [] },
					{ family: 'collections', total: 0, items: [] },
				],
				limit: 25,
			},
		});

		expect(screen.getByText('No records name this address.')).toBeTruthy();
		expect(screen.queryByRole('tab')).toBeNull();
	});

	it('says a failed read failed, and retries it', () => {
		const refetch = vi.fn(() => Promise.resolve());
		renderBody({ isError: true, refetch });

		expect(screen.getByRole('alert').textContent).toContain('Linked records could not be loaded.');
		expect(screen.queryByText('No records name this address.')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});
});
