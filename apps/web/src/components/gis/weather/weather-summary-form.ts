import { createWeatherSummaryCommand, DomainValidationError } from '@simmer-mosquito/domain';
import type { WeatherMetrics } from '../../../hooks/mutations/use-weather-summary-mutations';
import type { WeatherSummaryListing } from '../../../hooks/queries/weather-summary-view';
import { FORM_VALIDATION_CONTEXT } from '../../../lib/domain-validation';
// The weather summary form's own rules and its metric inputs, shared by the
// dialog that draws them and the hook that holds them.
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * What is wrong with the summary on screen, in words, or `null`.
 *
 * The domain's own builder decides almost all of it: metric bounds, two-decimal
 * precision, min-before-max, the date range, and "at least one reading".
 * Re-stating any of those here would be a second copy to drift from the one the
 * server runs, which `forms/domain-validation.ts` argues against at length.
 *
 * The future-date rule is the exception, and has to be, because it depends on
 * the organization's timezone and the domain is handed no clock.
 */
export function summaryIssue(input: {
	readonly parsed: WeatherMetrics | null;
	readonly startDate: string;
	readonly endDate: string;
	readonly today: string;
}): string | null {
	if (input.parsed === null) {
		return 'Readings must be numbers with at most two decimal places.';
	}
	const domainIssue = firstIssue(() =>
		createWeatherSummaryCommand({
			...FORM_VALIDATION_CONTEXT,
			weatherStationId: FORM_VALIDATION_CONTEXT.organizationId,
			weatherSummaryId: FORM_VALIDATION_CONTEXT.organizationId,
			startDate: input.startDate,
			endDate: input.endDate,
			...input.parsed,
		}),
	);
	if (domainIssue !== null) {
		return domainIssue;
	}
	return input.endDate > input.today ? 'A reading cannot be dated in the future.' : null;
}

/**
 * The first thing the domain objects to, in words, or `null`.
 *
 * The builder reports every issue it finds; the dialog has one line to say them
 * in, and the first is the one to fix. `humanizeIssue` is not reachable from
 * here, so the path is dropped rather than half-translated: the messages that
 * matter here name a bound or an ordering and read on their own.
 */
function firstIssue(build: () => unknown): string | null {
	try {
		build();
		return null;
	} catch (error) {
		if (!(error instanceof DomainValidationError)) {
			throw error;
		}
		return error.issues[0]?.message ?? 'This reading is not valid.';
	}
}

/**
 * The seven metrics, with their units in the label.
 *
 * The canonical units are Fahrenheit, inches, percent and miles per hour, and
 * they are fixed rather than following the organization's unit defaults, a
 * stored summary carries no unit of its own, so a form that offered a choice
 * would be writing one number under two meanings.
 */
export const METRIC_INPUTS = [
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

export type MetricInputs = Record<
	| 'temperatureMinF'
	| 'temperatureMaxF'
	| 'precipitationInches'
	| 'relativeHumidityMin'
	| 'relativeHumidityMax'
	| 'windSpeedMinMph'
	| 'windSpeedMaxMph',
	string
>;

export function metricInputsFrom(summary: WeatherSummaryListing | null): MetricInputs {
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
 * rather than rounding it, silently keeping two of a user's four decimals would
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
