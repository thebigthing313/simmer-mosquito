/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServiceRequestListing } from '../../../../../components/public-engagement/service-requests/service-request-listing';

/**
 * The Table's Age column under the Organization's overdue threshold (#1246):
 * the warning tone on an open request older than the threshold, and the default
 * tone on one exactly at it, on a closed one, and on every one while the
 * threshold is off.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children }: { children?: ReactNode }) => <a href="/">{children}</a>,
}));

const { ServiceRequestsTable } = await import(
	'../../../../../components/public-engagement/service-requests/service-requests-table'
);

afterEach(cleanup);

const TODAY = '2026-10-20';
/** A 14-day threshold on the 20th: received before the 6th is overdue. */
const CUTOFF = '2026-10-06';

function request(id: string, requestDate: string, closedAt: string | null): ServiceRequestListing {
	return {
		id,
		lat: 40,
		lng: -74,
		displayName: Number(id),
		intakeType: 'phone',
		requestDate,
		details: '',
		contactId: 'c1',
		addressId: 'a1',
		receivedByProfileId: null,
		closedAt,
	};
}

function renderTable(overdueCutoff: string | null) {
	render(
		<ServiceRequestsTable
			addressById={new Map()}
			contactById={new Map()}
			overdueCutoff={overdueCutoff}
			profileNames={new Map()}
			rows={[
				request('15', '2026-10-05', null),
				request('14', '2026-10-06', null),
				request('99', '2026-01-01', '2026-10-01T12:00:00.000Z'),
			]}
			today={TODAY}
		/>,
	);
}

/** The Age cell of the row titled `#<number>`. */
function ageCell(number: string): HTMLElement {
	const row = screen.getByText(`#${number}`).closest('tr');
	const cell = row?.querySelectorAll('td')[2];
	if (cell === undefined) {
		throw new Error(`No Age cell for #${number}.`);
	}
	return cell as HTMLElement;
}

describe('ServiceRequestsTable', () => {
	it('draws an open request 15 days old in the warning tone, and says so', () => {
		renderTable(CUTOFF);

		expect(ageCell('15').className).toContain('text-warning');
		expect(ageCell('15').textContent).toBe('15 days Overdue');
	});

	it('leaves a request 14 days old and a closed request in the default tone', () => {
		renderTable(CUTOFF);

		expect(ageCell('14').className).not.toContain('text-warning');
		expect(ageCell('14').textContent).toBe('14 days');
		expect(ageCell('99').className).not.toContain('text-warning');
	});

	it('draws no tone at all with the threshold off', () => {
		renderTable(null);

		expect(ageCell('15').className).not.toContain('text-warning');
		expect(ageCell('15').textContent).toBe('15 days');
	});
});
