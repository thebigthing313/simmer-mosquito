import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { useCallback, useState } from 'react';
import { newRecordId } from '../../../hooks/mutations/shared';
import {
	hasAnyMetric,
	useWeatherSummaryMutations,
	type WeatherMetrics,
	type WeatherSummaryFields,
} from '../../../hooks/mutations/use-weather-summary-mutations';
import type { WeatherSummaryListing } from '../../../hooks/queries/use-weather-summaries';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';

/**
 * One dialog for both manual summary writes — `summary === null` records a new
 * bucket, otherwise it corrects one. Callers mount it only while open, so the
 * fields start from the summary being edited without a sync-back effect.
 *
 * ## Why the end date defaults to the start date
 *
 * A bucket is inclusive at both ends and a single-day reading stores the same
 * date twice; the domain never emits an open end. Most entry is daily, so the end
 * follows the start until the user separates them, and a three-day rain gauge is
 * the case where they do.
 *
 * ## Why every metric is on screen at once
 *
 * The seven are what a summary can hold, and an empty box means "no reading",
 * which on an edit means "clear the one that is there". Hiding the empty ones
 * behind a picker would make clearing a value harder than setting one, and
 * clearing is the commoner correction — a gauge misread is fixed by emptying the
 * box, not by typing a different wrong number.
 */
export function WeatherSummaryDialog({
	stationId,
	summary,
	onClose,
}: {
	readonly stationId: string;
	readonly summary: WeatherSummaryListing | null;
	readonly onClose: () => void;
}) {
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
	const [metrics, setMetrics] = useState<MetricInputs>(() => metricInputsFrom(summary));
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const parsed = parseMetrics(metrics);
	const canSave = mutations.canWrite && isSaveable({ startDate, endDate, today, metrics: parsed });

	const onSave = useCallback(async () => {
		if (!canSave || parsed === null) {
			return;
		}
		setIsSaving(true);
		setError(null);
		const fields: WeatherSummaryFields = { startDate, endDate, ...parsed };
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
			setError(cause instanceof Error ? cause.message : 'Unable to save summary.');
		} finally {
			setIsSaving(false);
		}
	}, [canSave, parsed, startDate, endDate, summary, mutations, stationId, onClose]);

	const isEdit = summary !== null;

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open
		>
			<DialogContent className="sm:max-w-[540px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit Summary' : 'Record Summary'}</DialogTitle>
					<DialogDescription>
						Weather at this station over one stretch of days. Both dates are included.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4">
					<BucketDates
						endDate={endDate}
						onEndChange={(next) => {
							setEndTouched(true);
							setEndDate(next);
						}}
						onStartChange={(next) => {
							setStartDate(next);
							if (!endTouched) {
								setEndDate(next);
							}
						}}
						startDate={startDate}
						today={today}
					/>

					<MetricGrid
						onChange={(key, value) => setMetrics((current) => ({ ...current, [key]: value }))}
						values={metrics}
					/>

					{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
					{parsed !== null || error !== null ? null : (
						<p className="m-0 text-destructive text-sm">
							Readings must be numbers with at most two decimal places.
						</p>
					)}
				</div>

				<DialogFooter>
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={!canSave || isSaving} onClick={onSave} type="button">
						{isEdit ? 'Save Summary' : 'Record Summary'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Whether what is on screen is a summary at all.
 *
 * Only the rules the form can settle by itself. Overlap with another bucket is
 * not among them — that depends on what this station already holds, which is the
 * server's to check inside the write transaction, and guessing it here would
 * either block a legitimate save or promise one that is about to be refused.
 */
function isSaveable(input: {
	readonly startDate: string;
	readonly endDate: string;
	readonly today: string;
	readonly metrics: WeatherMetrics | null;
}): boolean {
	if (input.startDate.length === 0 || input.endDate.length === 0) {
		return false;
	}
	if (input.endDate < input.startDate || input.endDate > input.today) {
		return false;
	}
	// A summary with no readings on it is not a record of anything, and the domain
	// requires at least one.
	return input.metrics !== null && hasAnyMetric(input.metrics);
}

/** The bucket's two ends. Both inclusive, and neither may run past today. */
function BucketDates({
	startDate,
	endDate,
	today,
	onStartChange,
	onEndChange,
}: {
	readonly startDate: string;
	readonly endDate: string;
	readonly today: string;
	readonly onStartChange: (next: string) => void;
	readonly onEndChange: (next: string) => void;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<div className="grid gap-1.5">
				<Label htmlFor="summary-start">Start date</Label>
				<Input
					id="summary-start"
					max={today}
					onChange={(event) => onStartChange(event.target.value)}
					type="date"
					value={startDate}
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="summary-end">End date</Label>
				<Input
					id="summary-end"
					max={today}
					min={startDate}
					onChange={(event) => onEndChange(event.target.value)}
					type="date"
					value={endDate}
				/>
			</div>
		</div>
	);
}

/** The seven reading boxes. An empty one is "no reading", not an unfilled field. */
function MetricGrid({
	values,
	onChange,
}: {
	readonly values: MetricInputs;
	readonly onChange: (key: keyof MetricInputs, value: string) => void;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{METRIC_INPUTS.map((metric) => (
				<div className="grid gap-1.5" key={metric.key}>
					<Label htmlFor={`summary-${metric.key}`}>{metric.label}</Label>
					<Input
						id={`summary-${metric.key}`}
						inputMode="decimal"
						onChange={(event) => onChange(metric.key, event.target.value)}
						placeholder={metric.placeholder}
						type="number"
						value={values[metric.key]}
					/>
				</div>
			))}
		</div>
	);
}

/**
 * The seven metrics, with their units in the label.
 *
 * The canonical units are Fahrenheit, inches, percent and miles per hour, and
 * they are fixed rather than following the agency's unit defaults — a stored
 * summary carries no unit of its own, so a form that offered a choice would be
 * writing one number under two meanings.
 */
const METRIC_INPUTS = [
	{ key: 'temperatureMinF', label: 'Min temp (°F)', placeholder: 'e.g. 54' },
	{ key: 'temperatureMaxF', label: 'Max temp (°F)', placeholder: 'e.g. 78.5' },
	{ key: 'precipitationInches', label: 'Precipitation (in)', placeholder: 'e.g. 1.25' },
	{ key: 'relativeHumidityMin', label: 'Min humidity (%)', placeholder: 'e.g. 42' },
	{ key: 'relativeHumidityMax', label: 'Max humidity (%)', placeholder: 'e.g. 88' },
	{ key: 'windSpeedMinMph', label: 'Min wind (mph)', placeholder: 'e.g. 3' },
	{ key: 'windSpeedMaxMph', label: 'Max wind (mph)', placeholder: 'e.g. 17' },
] as const satisfies readonly {
	readonly key: keyof MetricInputs;
	readonly label: string;
	readonly placeholder: string;
}[];

type MetricInputs = Record<
	| 'temperatureMinF'
	| 'temperatureMaxF'
	| 'precipitationInches'
	| 'relativeHumidityMin'
	| 'relativeHumidityMax'
	| 'windSpeedMinMph'
	| 'windSpeedMaxMph',
	string
>;

function metricInputsFrom(summary: WeatherSummaryListing | null): MetricInputs {
	const text = (value: number | null | undefined) =>
		value === null || value === undefined ? '' : String(value);
	return {
		temperatureMinF: text(summary?.temperatureMinF),
		temperatureMaxF: text(summary?.temperatureMaxF),
		precipitationInches: text(summary?.precipitationInches),
		relativeHumidityMin: text(summary?.relativeHumidityMin),
		relativeHumidityMax: text(summary?.relativeHumidityMax),
		windSpeedMinMph: text(summary?.windSpeedMinMph),
		windSpeedMaxMph: text(summary?.windSpeedMaxMph),
	};
}

/**
 * The typed readings, or `null` when a box holds something that is not one.
 *
 * An empty box is a deliberate `null` rather than a refusal: that is how a
 * reading is cleared. Anything else that is not a finite number with at most two
 * decimals fails the whole parse, because the domain rejects extra precision
 * rather than rounding it — silently keeping two of a user's four decimals would
 * be the form deciding what they meant.
 */
export function parseMetrics(inputs: MetricInputs): WeatherMetrics | null {
	const parsed: Record<string, number | null> = {};
	for (const metric of METRIC_INPUTS) {
		const raw = inputs[metric.key].trim();
		if (raw.length === 0) {
			parsed[metric.key] = null;
			continue;
		}
		const value = Number(raw);
		if (!Number.isFinite(value) || decimalPlaces(raw) > 2) {
			return null;
		}
		parsed[metric.key] = value;
	}
	return parsed as unknown as WeatherMetrics;
}

function decimalPlaces(raw: string): number {
	const dot = raw.indexOf('.');
	return dot === -1 ? 0 : raw.length - dot - 1;
}
