/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, vi } from 'vitest';
import type { AssessedRow } from '../../../../../components/gis/weather/import-assessment';
import { FilePickerCard } from '../../../../../components/gis/weather/import-file-picker-card';
import { ImportPreview } from '../../../../../components/gis/weather/import-preview';
import { ImportResultCard } from '../../../../../components/gis/weather/import-result-card';
import { expectSidewaysScroller } from '../../../sideways-scroller';

afterEach(cleanup);

/**
 * The three tables on the weather import page are wider than the card on a
 * phone: the column guide, the preview with a column per metric the file
 * carried, and the rows the server refused. Each scrolls sideways inside the
 * styled scroll area (#1260).
 */
describe('weather import tables', () => {
	it('scrolls the column guide sideways', () => {
		render(<FilePickerCard isBusy={false} onFile={vi.fn()} />);

		expectSidewaysScroller(screen.getByRole('table'));
	});

	it('scrolls the preview sideways', () => {
		const assessed = [
			{
				action: 'insert',
				issues: [],
				line: 2,
				row: {
					endDate: '2026-06-01',
					precipitationInches: 0.4,
					relativeHumidityMax: 90,
					relativeHumidityMin: 40,
					startDate: '2026-06-01',
					temperatureMaxF: 88,
					temperatureMinF: 64,
					windSpeedMaxMph: 12,
					windSpeedMinMph: 2,
				},
			},
		] as unknown as readonly AssessedRow[];

		render(<ImportPreview assessed={assessed} />);

		expectSidewaysScroller(screen.getByRole('table'));
	});

	it('scrolls the refused rows sideways', () => {
		render(
			<ImportResultCard
				onDone={vi.fn()}
				result={{
					counts: { failed: 1, inserted: 0, noChange: 0, updated: 0 },
					rows: [
						{
							clientRowId: '4',
							issues: [{ message: 'Overlaps a reading.', path: 'startDate' }],
							status: 'failed',
							weatherSummaryId: null,
						},
					],
				}}
				stationName="North Station"
			/>,
		);

		expectSidewaysScroller(screen.getByRole('table'));
	});
});
