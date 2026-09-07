import {
	basePayload,
	createIssues,
	normalizeRequiredDomainId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
} from '../command-validation.js';
import type { DomainId, LocalDateString } from '../shared.js';
import {
	localDateField,
	normalizeUpdateFields,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
} from '../update-command-fields.js';
import {
	type ExpectedUpdatedAtInput,
	type ExpectedUpdatedAtPayload,
	normalizeExpectedUpdatedAt,
	normalizeMetricPatch,
	normalizeSummaryMetrics,
	validateDateRange,
	validateMetricPairOrdering,
	validateMetricSet,
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

export const WEATHER_SUMMARY_RANGE_UPDATE_FIELDS = {
	startDate: localDateField,
	endDate: localDateField,
} satisfies UpdateFieldSet;

export type UpdateWeatherSummaryCommandInput = WeatherCommandInput &
	ExpectedUpdatedAtInput &
	Partial<WeatherSummaryMetrics> &
	UpdateFieldsInput<typeof WEATHER_SUMMARY_RANGE_UPDATE_FIELDS> & {
		readonly weatherSummaryId: DomainId;
	};

export type UpdateWeatherSummaryCommand = WeatherDomainCommand<
	'weather.updateWeatherSummary',
	WeatherCommandPayload &
		ExpectedUpdatedAtPayload & {
			readonly weatherSummaryId: DomainId;
			readonly changes: UpdateFieldsChanges<typeof WEATHER_SUMMARY_RANGE_UPDATE_FIELDS> &
				Partial<WeatherSummaryMetrics>;
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

	// The range and the metrics are two registers, so neither one alone can say
	// whether this edit changes anything.
	const rangeChanges = normalizeUpdateFields(
		input,
		WEATHER_SUMMARY_RANGE_UPDATE_FIELDS,
		null,
		issues,
	);
	const metricChanges = normalizeMetricPatch(input, issues);
	if (Object.keys(rangeChanges).length === 0 && Object.keys(metricChanges).length === 0) {
		issues.push({ path: 'changes', message: 'At least one weather summary field must change.' });
	}
	if (
		rangeChanges.startDate !== undefined &&
		rangeChanges.endDate !== undefined &&
		rangeChanges.endDate < rangeChanges.startDate
	) {
		issues.push({ path: 'endDate', message: 'endDate must be on or after startDate.' });
	}
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
			changes: { ...rangeChanges, ...metricChanges },
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
