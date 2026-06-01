import { createIssues, requiredUuid as requireUuid, throwIfIssues } from '../command-validation.js';
import type { DomainId, LocalDateString } from '../shared.js';
import {
	basePayload,
	type ExpectedUpdatedAtInput,
	type ExpectedUpdatedAtPayload,
	normalizeExpectedUpdatedAt,
	normalizeMetricPatch,
	normalizeRequiredDomainId,
	normalizeSummaryMetrics,
	validateBase,
	validateDateRange,
	validateLocalDate,
	validateMetricPairOrdering,
	validateMetricSet,
	WEATHER_SUMMARY_METRIC_FIELDS,
	type WeatherCommandInput,
	type WeatherCommandPayload,
	type WeatherDomainCommand,
	type WeatherSummaryMetrics,
} from './shared.js';

export interface CreateWeatherSummaryCommandInput
	extends WeatherCommandInput,
		Partial<WeatherSummaryMetrics> {
	readonly weatherStationId: DomainId;
	readonly weatherSummaryId: DomainId;
	readonly startDate: LocalDateString;
	readonly endDate: LocalDateString;
}

export type CreateWeatherSummaryCommand = WeatherDomainCommand<
	'weather.createWeatherSummary',
	WeatherCommandPayload &
		WeatherSummaryMetrics & {
			readonly weatherStationId: DomainId;
			readonly weatherSummaryId: DomainId;
			readonly startDate: LocalDateString;
			readonly endDate: LocalDateString;
		}
>;

export interface UpdateWeatherSummaryCommandInput
	extends WeatherCommandInput,
		ExpectedUpdatedAtInput,
		Partial<WeatherSummaryMetrics> {
	readonly weatherSummaryId: DomainId;
	readonly startDate?: LocalDateString;
	readonly endDate?: LocalDateString;
}

export type UpdateWeatherSummaryCommand = WeatherDomainCommand<
	'weather.updateWeatherSummary',
	WeatherCommandPayload &
		ExpectedUpdatedAtPayload & {
			readonly weatherSummaryId: DomainId;
			readonly changes: Partial<WeatherSummaryMetrics> &
				Readonly<{
					readonly startDate?: LocalDateString;
					readonly endDate?: LocalDateString;
				}>;
		}
>;

export interface DeleteWeatherSummaryCommandInput
	extends WeatherCommandInput,
		ExpectedUpdatedAtInput {
	readonly weatherSummaryId: DomainId;
}

export type DeleteWeatherSummaryCommand = WeatherDomainCommand<
	'weather.deleteWeatherSummary',
	WeatherCommandPayload & ExpectedUpdatedAtPayload & { readonly weatherSummaryId: DomainId }
>;

export function isSingleDayWeatherBucket(input: {
	readonly startDate: LocalDateString;
	readonly endDate: LocalDateString;
}): boolean {
	return input.startDate === input.endDate;
}

export function createWeatherSummaryCommand(
	input: CreateWeatherSummaryCommandInput,
): CreateWeatherSummaryCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherStationId, 'weatherStationId', issues);
	requireUuid(input.weatherSummaryId, 'weatherSummaryId', issues);
	validateDateRange(input.startDate, input.endDate, issues);
	const metrics = normalizeSummaryMetrics(input, '', issues);
	validateMetricSet(metrics, issues);
	throwIfIssues('Create weather summary command is invalid.', issues);
	return {
		type: 'weather.createWeatherSummary',
		payload: {
			...basePayload(input),
			weatherStationId: normalizeRequiredDomainId(input.weatherStationId),
			weatherSummaryId: normalizeRequiredDomainId(input.weatherSummaryId),
			startDate: input.startDate,
			endDate: input.endDate,
			...metrics,
		},
	};
}

export function updateWeatherSummaryCommand(
	input: UpdateWeatherSummaryCommandInput,
): UpdateWeatherSummaryCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherSummaryId, 'weatherSummaryId', issues);
	normalizeExpectedUpdatedAt(input.expectedUpdatedAt, 'expectedUpdatedAt', issues);
	const hasStart = input.startDate !== undefined;
	const hasEnd = input.endDate !== undefined;
	const hasMetric = WEATHER_SUMMARY_METRIC_FIELDS.some((field) => input[field] !== undefined);
	if (!hasStart && !hasEnd && !hasMetric) {
		issues.push({ path: 'changes', message: 'At least one weather summary field must change.' });
	}
	if (hasStart) {
		validateLocalDate(input.startDate, 'startDate', issues);
	}
	if (hasEnd) {
		validateLocalDate(input.endDate, 'endDate', issues);
	}
	if (hasStart && hasEnd && input.endDate < input.startDate) {
		issues.push({ path: 'endDate', message: 'endDate must be on or after startDate.' });
	}
	const metricChanges = normalizeMetricPatch(input, issues);
	validateMetricPairOrdering(metricChanges, issues);
	throwIfIssues('Update weather summary command is invalid.', issues);
	return {
		type: 'weather.updateWeatherSummary',
		payload: {
			...basePayload(input),
			expectedUpdatedAt: normalizeExpectedUpdatedAt(
				input.expectedUpdatedAt,
				'expectedUpdatedAt',
				createIssues(),
			),
			weatherSummaryId: normalizeRequiredDomainId(input.weatherSummaryId),
			changes: {
				...(hasStart ? { startDate: input.startDate } : {}),
				...(hasEnd ? { endDate: input.endDate } : {}),
				...metricChanges,
			},
		},
	};
}

export function deleteWeatherSummaryCommand(
	input: DeleteWeatherSummaryCommandInput,
): DeleteWeatherSummaryCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherSummaryId, 'weatherSummaryId', issues);
	normalizeExpectedUpdatedAt(input.expectedUpdatedAt, 'expectedUpdatedAt', issues);
	throwIfIssues('Delete weather summary command is invalid.', issues);
	return {
		type: 'weather.deleteWeatherSummary',
		payload: {
			...basePayload(input),
			expectedUpdatedAt: normalizeExpectedUpdatedAt(
				input.expectedUpdatedAt,
				'expectedUpdatedAt',
				createIssues(),
			),
			weatherSummaryId: normalizeRequiredDomainId(input.weatherSummaryId),
		},
	};
}
