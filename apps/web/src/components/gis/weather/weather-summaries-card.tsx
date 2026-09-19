import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { useState } from 'react';
import { useActiveYear } from '../../../hooks/gis/use-active-year';
import { useWeatherSummaryMutations } from '../../../hooks/mutations/use-weather-summary-mutations';
import { useWeatherSummaries } from '../../../hooks/queries/use-weather-summaries';
import { useWeatherSummaryYears } from '../../../hooks/queries/use-weather-summary-years';
import type { WeatherSummaryListing } from '../../../hooks/queries/weather-summary-view';
import { errorMessageForSave } from '../../../lib/save-error';
import { SummariesBody, YearTabs } from './weather-summaries-table';
import { ConfirmSummaryDelete, SummaryActions } from './weather-summary-actions';
import { WeatherSummaryDialog } from './weather-summary-dialog';

/**
 * A station's readings, a year at a time, and the three ways to change them.
 * The tabs are the years the station has readings in, newest first. The tab
 * follows a write, because `weather_summaries` is on-demand and a write into
 * a subset the live query does not cover waits out a txid that never arrives;
 * that is also why the dialog is mounted here, since the card is what keeps
 * the station's subset queried.
 */
export function WeatherSummariesCard({
	stationId,
	isStationActive,
}: {
	readonly stationId: string;
	readonly isStationActive: boolean;
}) {
	const { years, isReady: yearsReady, isError: yearsError } = useWeatherSummaryYears(stationId);
	const { activeYear, tabYears, chooseYear } = useActiveYear(stationId, years);
	const { summaries, isReady, isError } = useWeatherSummaries(stationId, activeYear);
	const mutations = useWeatherSummaryMutations();
	const [editing, setEditing] = useState<{ readonly summary: WeatherSummaryListing | null } | null>(
		null,
	);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<WeatherSummaryListing | null>(null);

	const remove = async (summaryId: string) => {
		setRemoveError(null);
		try {
			await mutations.remove(summaryId);
		} catch (error) {
			setRemoveError(errorMessageForSave(error, 'Unable to delete summary.'));
		}
	};

	return (
		<Card variant="surface">
			<CardHeader padding="compact" className="flex flex-wrap items-center justify-between gap-2">
				<CardTitle>Summaries</CardTitle>
				<SummaryActions
					isStationActive={isStationActive}
					onRecord={() => setEditing({ summary: null })}
					stationId={stationId}
				/>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				{removeError === null ? null : (
					<p className="m-0 text-destructive text-sm">{removeError}</p>
				)}
				{tabYears.length < 2 ? null : (
					<YearTabs onChange={chooseYear} value={activeYear} years={tabYears} />
				)}
				<SummariesBody
					isError={isError || yearsError}
					isReady={isReady && yearsReady}
					onEdit={(summary) => setEditing({ summary })}
					onRemove={setConfirming}
					summaries={summaries}
					year={activeYear}
				/>
			</CardContent>

			{editing === null ? null : (
				<WeatherSummaryDialog
					onClose={() => setEditing(null)}
					onWriteYear={chooseYear}
					stationId={stationId}
					summary={editing.summary}
				/>
			)}

			<ConfirmSummaryDelete
				onCancel={() => setConfirming(null)}
				onConfirm={() => {
					const target = confirming;
					setConfirming(null);
					if (target !== null) {
						void remove(target.id);
					}
				}}
				summary={confirming}
			/>
		</Card>
	);
}
