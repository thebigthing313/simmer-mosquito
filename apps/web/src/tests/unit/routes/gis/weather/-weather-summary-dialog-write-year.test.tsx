/** @vitest-environment jsdom */

/**
 * The dialog says which year it is about to write into, before it writes.
 *
 * `weather_summaries` is on-demand and the card that mounts this dialog
 * live-queries one year at a time. A save into a year that query does not cover
 * waits out a txid that never arrives on the subset; `settleWrite` swallows the
 * five-second timeout, so it reads as a save that took five seconds and then
 * showed nothing. The card moves its tab to the written year, and it can only do
 * that if it hears about the year before the write goes out.
 *
 * The order is the whole point, so the create here never resolves. If the call
 * moved to after the `await`, nothing would arrive.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn(() => new Promise<void>(() => {}));
const save = vi.fn(() => new Promise<void>(() => {}));

vi.mock('../../../../../hooks/mutations/use-weather-summary-mutations', () => ({
	useWeatherSummaryMutations: () => ({ create, save, remove: vi.fn(), canWrite: true }),
}));
vi.mock('../../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/Los_Angeles',
}));

const { WeatherSummaryDialog } = await import(
	'../../../../../routes/gis/weather/-weather-summary-dialog'
);

const STATION = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('recording a reading', () => {
	it('names the year before the write goes out', () => {
		const onWriteYear = vi.fn();
		render(
			<WeatherSummaryDialog
				onClose={() => {}}
				onWriteYear={onWriteYear}
				stationId={STATION}
				summary={null}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2019-07-04' } });
		fireEvent.change(screen.getByLabelText('Precipitation (in)'), { target: { value: '0.5' } });
		fireEvent.click(screen.getByRole('button', { name: 'Record Summary' }));

		expect(onWriteYear).toHaveBeenCalledWith(2019);
		expect(create).toHaveBeenCalledTimes(1);
	});
});
