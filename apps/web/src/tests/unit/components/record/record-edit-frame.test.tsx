/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	EditFormSkeleton,
	RecordEditFrame,
	type RecordReading,
} from '../../../../components/record';

// The unavailable state reads the router for its back link and breadcrumb;
// `record-unavailable.test.tsx` covers that, and no router is mounted here.
vi.mock('../../../../hooks/record/use-unavailable-record-trail', () => ({
	useUnavailableRecordTrail: () => null,
}));

afterEach(cleanup);

interface Station {
	readonly id: string;
	readonly name: string;
}

function frame(reading: RecordReading<Station>) {
	return (
		<RecordEditFrame
			recordType="weatherStation"
			reading={reading}
			skeleton={<EditFormSkeleton rows={[['h-9', 'h-9'], 'h-24']} />}
		>
			{(station) => <p>{station.name}</p>}
		</RecordEditFrame>
	);
}

/**
 * The fork eighteen edit routes each wrote by hand, six of them wrong.
 *
 * A read that failed is not a record that is missing, and the two lead a reader
 * to opposite next actions: try again, or stop looking.
 */
describe('RecordEditFrame', () => {
	it('stands in for the record while the collection is still answering', () => {
		const { container } = render(frame({ isReady: false, record: undefined }));

		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
		expect(screen.queryByText(/could not be/)).toBeNull();
	});

	// The defect: six routes answered this with "no such record".
	it('says a failed read failed, whatever the collection holds', () => {
		render(frame({ isError: true, isReady: true, record: { id: 's1', name: 'Cannery Row' } }));

		expect(
			screen.getByText('This weather station could not be loaded. Try again shortly.'),
		).toBeTruthy();
		expect(screen.queryByText('Cannery Row')).toBeNull();
	});

	// And the other half of it, so the fix cannot be a blanket error state.
	it('says a record is missing once the collection has answered and holds none', () => {
		render(frame({ isReady: true, record: null }));

		expect(
			screen.getByText('This weather station could not be found, or you do not have access to it.'),
		).toBeTruthy();
	});

	it('draws the record it is handed', () => {
		render(frame({ isReady: true, record: { id: 's1', name: 'Cannery Row' } }));

		expect(screen.getByText('Cannery Row')).toBeTruthy();
	});

	// The heading is derived rather than passed, so the record type a route
	// already declares is the only thing that decides it.
	it('heads both unavailable states from the register', () => {
		const { rerender } = render(frame({ isReady: true, record: null }));
		expect(screen.getByText('Weather Station Unavailable')).toBeTruthy();

		rerender(frame({ isError: true, isReady: true, record: null }));
		expect(screen.getByText('Weather Station Unavailable')).toBeTruthy();
	});
});
