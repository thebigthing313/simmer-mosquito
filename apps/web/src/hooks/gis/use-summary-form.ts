import { useState } from 'react';
import { todayInTimeZone } from '../../lib/local-date';
import { errorMessageForSave } from '../../lib/save-error';
import {
	type MetricInputs,
	metricInputsFrom,
	parseMetrics,
	summaryIssue,
} from '../../routes/gis/weather/-weather-summary-form';
import { newRecordId } from '../mutations/shared';
import {
	useWeatherSummaryMutations,
	type WeatherSummaryFields,
} from '../mutations/use-weather-summary-mutations';
import { summaryYear, type WeatherSummaryListing } from '../queries/weather-summary-view';
import { useOrganizationTimeZone } from '../use-organization-time-zone';

/**
 * Everything the weather summary dialog holds while it is open, and the one
 * write it makes. The end date follows the start until the user separates
 * them. `onWriteYear` is called before the write.
 */
export function useSummaryForm(input: {
	readonly stationId: string;
	readonly summary: WeatherSummaryListing | null;
	readonly onClose: () => void;
	readonly onWriteYear: (year: number) => void;
}) {
	const { stationId, summary, onClose, onWriteYear } = input;
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const mutations = useWeatherSummaryMutations();

	const [startDate, setStartDate] = useState(summary?.startDate ?? today);
	const [endDate, setEndDate] = useState(summary?.endDate ?? today);
	// Whether the user has separated the two ends. Until they do, moving the start
	// moves the end with it, which is what a single-day entry wants.
	const [endTouched, setEndTouched] = useState(
		summary !== null && summary.startDate !== summary.endDate,
	);
	const [metricInputs, setMetricInputs] = useState<MetricInputs>(() => metricInputsFrom(summary));
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const parsed = parseMetrics(metricInputs);
	const issue = summaryIssue({ parsed, startDate, endDate, today });
	const canSave = mutations.canWrite && parsed !== null && issue === null;

	const moveStart = (next: string) => {
		setStartDate(next);
		if (!endTouched) {
			setEndDate(next);
		}
	};

	const moveEnd = (next: string) => {
		setEndTouched(true);
		setEndDate(next);
	};

	const setMetric = (key: keyof MetricInputs, value: string) => {
		setMetricInputs((current) => ({ ...current, [key]: value }));
	};

	const save = async () => {
		if (!canSave || parsed === null) {
			return;
		}
		setIsSaving(true);
		setError(null);
		const fields: WeatherSummaryFields = { startDate, endDate, ...parsed };
		// Before the write, not after. The card lists one year at a time, and a
		// write into a year its live query does not cover waits out a txid that
		// never arrives on that subset: `settleWrite` swallows the five-second
		// timeout, so the dialog closes late over a row the user cannot see.
		onWriteYear(summaryYear(endDate));
		try {
			if (summary === null) {
				await mutations.create({
					weatherSummaryId: newRecordId(),
					weatherStationId: stationId,
					fields,
				});
			} else {
				await mutations.save({ weatherSummaryId: summary.id, fields });
			}
			onClose();
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to save summary.'));
		}
		setIsSaving(false);
	};

	return {
		dates: { startDate, endDate, today, setStartDate: moveStart, setEndDate: moveEnd },
		metrics: { values: metricInputs, set: setMetric },
		issue,
		canSave,
		isSaving,
		error,
		save: () => {
			void save();
		},
	};
}
