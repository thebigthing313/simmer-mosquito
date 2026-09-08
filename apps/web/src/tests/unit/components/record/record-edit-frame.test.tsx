/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	EditFormSkeleton,
	RecordEditFrame,
	type RecordReading,
} from '../../../../components/record';

afterEach(cleanup);

interface Station {
	readonly id: string;
	readonly name: string;
}

function frame(reading: RecordReading<Station>) {
	return (
		<RecordEditFrame
			noun="weather station"
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

	it('titles both unavailable states where the noun makes the wrong heading', () => {
		render(
			<RecordEditFrame
				noun="source reduction action"
				reading={{ isReady: true, record: undefined }}
				skeleton={null}
				unavailableTitle="Source Reduction Unavailable"
			>
				{() => <p>never</p>}
			</RecordEditFrame>,
		);

		expect(screen.getByText('Source Reduction Unavailable')).toBeTruthy();
	});
});
