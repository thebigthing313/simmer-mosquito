import {
	createIssues,
	requiredId as normalizeRequiredId,
	validateAgencyCommandContext,
} from '../command-validation.js';
import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type LocalDateString,
	normalizePointGeometry,
} from '../shared.js';

export const WEATHER_METRIC_DECIMAL_PLACES = 2;
export const MAX_WEATHER_IMPORT_ROWS = 5_000;

export const WEATHER_SUMMARY_METRIC_FIELDS = [
	'temperatureMinF',
	'temperatureMaxF',
	'precipitationInches',
	'relativeHumidityMin',
	'relativeHumidityMax',
	'windSpeedMinMph',
	'windSpeedMaxMph',
] as const;

export type WeatherSummaryMetricField = (typeof WEATHER_SUMMARY_METRIC_FIELDS)[number];

export const WEATHER_METRIC_BOUNDS: Readonly<
	Record<WeatherSummaryMetricField, Readonly<{ min: number; max: number }>>
> = {
	temperatureMinF: { min: -100, max: 160 },
	temperatureMaxF: { min: -100, max: 160 },
	precipitationInches: { min: 0, max: 500 },
	relativeHumidityMin: { min: 0, max: 100 },
	relativeHumidityMax: { min: 0, max: 100 },
	windSpeedMinMph: { min: 0, max: 300 },
	windSpeedMaxMph: { min: 0, max: 300 },
} as const;

export interface WeatherSummaryMetrics {
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
}

export type WeatherCommandType =
	| 'weather.createWeatherStation'
	| 'weather.updateWeatherStationDetails'
	| 'weather.updateWeatherStationLocation'
	| 'weather.deactivateWeatherStation'
	| 'weather.reactivateWeatherStation'
	| 'weather.deleteWeatherStation'
	| 'weather.createWeatherSummary'
	| 'weather.updateWeatherSummary'
	| 'weather.deleteWeatherSummary'
	| 'weather.commitWeatherSummaryImport';

export interface WeatherDomainCommand<TType extends WeatherCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface WeatherCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface WeatherCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface ExpectedUpdatedAtInput {
	readonly expectedUpdatedAt?: Date | null;
}

export interface ExpectedUpdatedAtPayload {
	readonly expectedUpdatedAt: Date | null;
}

export function validateBase(input: WeatherCommandInput, issues: DomainValidationIssue[]): void {
	validateAgencyCommandContext(input, issues);
}

export function basePayload(input: WeatherCommandInput): WeatherCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

export function validatePointGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPoint {
	try {
		return normalizePointGeometry(value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

export function normalizeExpectedUpdatedAt(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return null;
	}
	return value;
}

export function validateLocalDate(
	value: LocalDateString | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (value === undefined || !isLocalDateString(value)) {
		issues.push({ path, message: `${path} must be a YYYY-MM-DD date string.` });
		return;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		issues.push({ path, message: `${path} must be a valid calendar date.` });
	}
}

export function validateDateRange(
	startDate: LocalDateString | undefined,
	endDate: LocalDateString | undefined,
	issues: DomainValidationIssue[],
): void {
	validateLocalDate(startDate, 'startDate', issues);
	validateLocalDate(endDate, 'endDate', issues);
	if (
		typeof startDate === 'string' &&
		typeof endDate === 'string' &&
		isLocalDateString(startDate) &&
		isLocalDateString(endDate) &&
		endDate < startDate
	) {
		issues.push({ path: 'endDate', message: 'endDate must be on or after startDate.' });
	}
}

export function validateOptionalCurrentLocalDate(value: LocalDateString | undefined): void {
	if (value === undefined) {
		return;
	}
	const issues = createIssues();
	validateLocalDate(value, 'currentLocalDate', issues);
	if (issues.length > 0) {
		throw new DomainValidationError('Current local date is invalid.', issues);
	}
}

export function normalizeSummaryMetrics(
	input: Partial<WeatherSummaryMetrics>,
	pathPrefix: string,
	issues: DomainValidationIssue[],
): WeatherSummaryMetrics {
	return {
		temperatureMinF: normalizeMetric(
			input.temperatureMinF,
			`${pathPrefix}temperatureMinF`,
			'temperatureMinF',
			issues,
		),
		temperatureMaxF: normalizeMetric(
			input.temperatureMaxF,
			`${pathPrefix}temperatureMaxF`,
			'temperatureMaxF',
			issues,
		),
		precipitationInches: normalizeMetric(
			input.precipitationInches,
			`${pathPrefix}precipitationInches`,
			'precipitationInches',
			issues,
		),
		relativeHumidityMin: normalizeMetric(
			input.relativeHumidityMin,
			`${pathPrefix}relativeHumidityMin`,
			'relativeHumidityMin',
			issues,
		),
		relativeHumidityMax: normalizeMetric(
			input.relativeHumidityMax,
			`${pathPrefix}relativeHumidityMax`,
			'relativeHumidityMax',
			issues,
		),
		windSpeedMinMph: normalizeMetric(
			input.windSpeedMinMph,
			`${pathPrefix}windSpeedMinMph`,
			'windSpeedMinMph',
			issues,
		),
		windSpeedMaxMph: normalizeMetric(
			input.windSpeedMaxMph,
			`${pathPrefix}windSpeedMaxMph`,
			'windSpeedMaxMph',
			issues,
		),
	};
}

export type MutableMetricPatch = {
	-readonly [K in keyof WeatherSummaryMetrics]?: WeatherSummaryMetrics[K];
};

export function normalizeMetricPatch(
	input: Partial<WeatherSummaryMetrics>,
	issues: DomainValidationIssue[],
): Partial<WeatherSummaryMetrics> {
	const changes: MutableMetricPatch = {};
	for (const field of WEATHER_SUMMARY_METRIC_FIELDS) {
		if (input[field] !== undefined) {
			changes[field] = normalizeMetric(input[field], field, field, issues);
		}
	}
	return changes;
}

function normalizeMetric(
	value: number | null | undefined,
	path: string,
	field: WeatherSummaryMetricField,
	issues: DomainValidationIssue[],
): number | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		issues.push({ path, message: `${path} must be a finite number or null.` });
		return null;
	}
	const normalized = Object.is(value, -0) ? 0 : value;
	const bounds = WEATHER_METRIC_BOUNDS[field];
	if (normalized < bounds.min || normalized > bounds.max) {
		issues.push({
			path,
			message: `${path} must be between ${bounds.min} and ${bounds.max}.`,
		});
	}
	if (!hasMaxDecimalPlaces(normalized, WEATHER_METRIC_DECIMAL_PLACES)) {
		issues.push({
			path,
			message: `${path} must have ${WEATHER_METRIC_DECIMAL_PLACES} decimal places or fewer.`,
		});
	}
	return normalized;
}

export function validateMetricSet(
	metrics: WeatherSummaryMetrics,
	issues: DomainValidationIssue[],
): void {
	if (WEATHER_SUMMARY_METRIC_FIELDS.every((field) => metrics[field] === null)) {
		issues.push({ path: 'metrics', message: 'At least one weather metric is required.' });
	}
	validateMetricPairOrdering(metrics, issues);
}

export function validateMetricPairOrdering(
	metrics: Partial<WeatherSummaryMetrics>,
	issues: DomainValidationIssue[],
): void {
	if (
		metrics.temperatureMinF !== undefined &&
		metrics.temperatureMaxF !== undefined &&
		metrics.temperatureMinF !== null &&
		metrics.temperatureMaxF !== null &&
		metrics.temperatureMinF > metrics.temperatureMaxF
	) {
		issues.push({
			path: 'temperatureMaxF',
			message: 'temperatureMaxF must be greater than or equal to temperatureMinF.',
		});
	}
	if (
		metrics.relativeHumidityMin !== undefined &&
		metrics.relativeHumidityMax !== undefined &&
		metrics.relativeHumidityMin !== null &&
		metrics.relativeHumidityMax !== null &&
		metrics.relativeHumidityMin > metrics.relativeHumidityMax
	) {
		issues.push({
			path: 'relativeHumidityMax',
			message: 'relativeHumidityMax must be greater than or equal to relativeHumidityMin.',
		});
	}
	if (
		metrics.windSpeedMinMph !== undefined &&
		metrics.windSpeedMaxMph !== undefined &&
		metrics.windSpeedMinMph !== null &&
		metrics.windSpeedMaxMph !== null &&
		metrics.windSpeedMinMph > metrics.windSpeedMaxMph
	) {
		issues.push({
			path: 'windSpeedMaxMph',
			message: 'windSpeedMaxMph must be greater than or equal to windSpeedMinMph.',
		});
	}
}

export function metricsEqual(a: WeatherSummaryMetrics, b: WeatherSummaryMetrics): boolean {
	return WEATHER_SUMMARY_METRIC_FIELDS.every((field) => a[field] === b[field]);
}

export function rangesOverlap(
	a: { readonly startDate: LocalDateString; readonly endDate: LocalDateString },
	b: { readonly startDate: LocalDateString; readonly endDate: LocalDateString },
): boolean {
	return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function emptyMetrics(): WeatherSummaryMetrics {
	return {
		temperatureMinF: null,
		temperatureMaxF: null,
		precipitationInches: null,
		relativeHumidityMin: null,
		relativeHumidityMax: null,
		windSpeedMinMph: null,
		windSpeedMaxMph: null,
	};
}

function isLocalDateString(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function hasMaxDecimalPlaces(value: number, places: number): boolean {
	const factor = 10 ** places;
	const scaled = value * factor;
	return Math.abs(scaled - Math.round(scaled)) < Number.EPSILON * factor;
}

export function normalizeRequiredDomainId(value: DomainId): DomainId {
	return normalizeRequiredId(value);
}
