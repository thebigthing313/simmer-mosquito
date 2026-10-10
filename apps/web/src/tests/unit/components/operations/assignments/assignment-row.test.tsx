/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignmentRow } from '../../../../../components/operations/assignments/assignment-row';
import type { AssignmentListing } from '../../../../../hooks/queries/assignment-view';

/**
 * What an Assignments index row is named, on screen and to a screen reader.
 *
 * An unnamed assignment is named by its formatted date. The select button over
 * the card used to announce the ISO date while the title read the formatted
 * one, and it did not trim, so a name of only spaces announced as blank
 * (#1529). Both now read `assignmentDisplayName`.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../../routes/route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('../../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));

afterEach(cleanup);

function listing(assignmentName: string | null): AssignmentListing {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		assignmentName,
		assignmentDate: '2026-08-04',
		assignedToProfileId: null,
		dueAt: null,
		startedAt: null,
		completedAt: null,
		cancelledAt: null,
	};
}

function renderRow(assignmentName: string | null) {
	render(
		<ul>
			<AssignmentRow
				assigneeName="Rivera"
				assignment={listing(assignmentName)}
				counts={null}
				isSelected={false}
				onSelect={() => {}}
			/>
		</ul>,
	);
}

describe('AssignmentRow', () => {
	it('names an unnamed assignment by its formatted date, on screen and on the select button', () => {
		renderRow(null);

		expect(screen.getByRole('button', { name: 'Show Tue, Aug 4, 2026 on the map' })).toBeTruthy();
		expect(screen.getByText('Tue, Aug 4, 2026')).toBeTruthy();
		// The date is the name, so the second line does not draw it again.
		expect(screen.getByText('Rivera')).toBeTruthy();
	});

	it('reads a name of only whitespace as no name', () => {
		renderRow('   ');

		expect(screen.getByRole('button', { name: 'Show Tue, Aug 4, 2026 on the map' })).toBeTruthy();
		expect(screen.getByText('Rivera')).toBeTruthy();
	});

	it('draws a trimmed name, with the date in front of the assignee', () => {
		renderRow('  North sweep ');

		expect(screen.getByRole('button', { name: 'Show North sweep on the map' })).toBeTruthy();
		expect(screen.getByText('North sweep')).toBeTruthy();
		expect(screen.getByText('Tue, Aug 4, 2026 · Rivera')).toBeTruthy();
	});
});
