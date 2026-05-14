import {
	createIssues,
	jsonObject as normalizeJsonObject,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateAgencyCommandContext,
} from '../command-validation.js';
import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type JsonObject,
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

export type WeatherStationStatus = 'active' | 'inactive' | 'deleted';

export interface WeatherStationStatusInput {
	readonly isActive: boolean;
	readonly deletedAt?: Date | string | null;
}

export type WeatherImportAssessmentAction = 'insert' | 'update' | 'noChange' | 'fail';
export type WeatherImportCommitStatus = 'inserted' | 'updated' | 'noChange' | 'failed';

export type WeatherImportAssessmentCounts = Readonly<Record<WeatherImportAssessmentAction, number>>;

export interface ExistingWeatherSummaryForAssessment extends WeatherSummaryMetrics {
	readonly weatherSummaryId: DomainId;
	readonly startDate: LocalDateString;
	readonly endDate: LocalDateString;
}

export interface WeatherSummaryImportRowInput extends WeatherSummaryMetrics {
	readonly clientRowId: string;
	readonly weatherSummaryId: DomainId;
	readonly startDate: LocalDateString;
	readonly endDate: LocalDateString;
}

export interface NormalizedWeatherSummaryImportRow extends WeatherSummaryMetrics {
	readonly clientRowId: string;
	readonly weatherSummaryId: DomainId;
	readonly startDate: LocalDateString;
	readonly endDate: LocalDateString;
}

export interface AssessWeatherSummaryImportRowsInput {
	readonly rows: readonly WeatherSummaryImportRowInput[];
	readonly existingSummaries?: readonly ExistingWeatherSummaryForAssessment[];
	readonly currentLocalDate?: LocalDateString;
}

export interface WeatherSummaryImportRowAssessment {
	readonly clientRowId: string;
	readonly submittedWeatherSummaryId: DomainId;
	readonly weatherSummaryId: DomainId | null;
	readonly startDate: LocalDateString;
	readonly endDate: LocalDateString;
	readonly action: WeatherImportAssessmentAction;
	readonly issues: readonly DomainValidationIssue[];
}

export interface WeatherSummaryImportAssessment {
	readonly rows: readonly WeatherSummaryImportRowAssessment[];
	readonly counts: WeatherImportAssessmentCounts;
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

interface WeatherCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface WeatherCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface ExpectedUpdatedAtInput {
	readonly expectedUpdatedAt?: Date | null;
}

interface ExpectedUpdatedAtPayload {
	readonly expectedUpdatedAt: Date | null;
}

export interface CreateWeatherStationCommandInput extends WeatherCommandInput {
	readonly weatherStationId: DomainId;
	readonly stationName: string;
	readonly stationCode?: string | null;
	readonly geometry: unknown;
	readonly metadata?: unknown | null;
}

export type CreateWeatherStationCommand = WeatherDomainCommand<
	'weather.createWeatherStation',
	WeatherCommandPayload & {
		readonly weatherStationId: DomainId;
		readonly stationName: string;
		readonly stationCode: string | null;
		readonly geometry: GeoJsonPoint;
		readonly metadata: JsonObject | null;
	}
>;

export interface UpdateWeatherStationDetailsCommandInput
	extends WeatherCommandInput,
		ExpectedUpdatedAtInput {
	readonly weatherStationId: DomainId;
	readonly stationName?: string;
	readonly stationCode?: string | null;
	readonly metadata?: unknown | null;
	readonly acknowledgedHistoricalStationIdentityChange?: boolean;
}

export type UpdateWeatherStationDetailsCommand = WeatherDomainCommand<
	'weather.updateWeatherStationDetails',
	WeatherCommandPayload &
		ExpectedUpdatedAtPayload & {
			readonly weatherStationId: DomainId;
			readonly changes: Readonly<{
				readonly stationName?: string;
				readonly stationCode?: string | null;
				readonly metadata?: JsonObject | null;
			}>;
			readonly acknowledgedHistoricalStationIdentityChange: boolean;
		}
>;

export interface UpdateWeatherStationLocationCommandInput
	extends WeatherCommandInput,
		ExpectedUpdatedAtInput {
	readonly weatherStationId: DomainId;
	readonly geometry: unknown;
	readonly acknowledgedHistoricalLocationChange?: boolean;
}

export type UpdateWeatherStationLocationCommand = WeatherDomainCommand<
	'weather.updateWeatherStationLocation',
	WeatherCommandPayload &
		ExpectedUpdatedAtPayload & {
			readonly weatherStationId: DomainId;
			readonly geometry: GeoJsonPoint;
			readonly acknowledgedHistoricalLocationChange: boolean;
		}
>;

export interface WeatherStationIdCommandInput extends WeatherCommandInput, ExpectedUpdatedAtInput {
	readonly weatherStationId: DomainId;
}

export type DeactivateWeatherStationCommand = WeatherDomainCommand<
	'weather.deactivateWeatherStation',
	WeatherCommandPayload & ExpectedUpdatedAtPayload & { readonly weatherStationId: DomainId }
>;

export type ReactivateWeatherStationCommand = WeatherDomainCommand<
	'weather.reactivateWeatherStation',
	WeatherCommandPayload & ExpectedUpdatedAtPayload & { readonly weatherStationId: DomainId }
>;

export interface DeleteWeatherStationCommandInput extends WeatherStationIdCommandInput {
	readonly acknowledgedSummaryDeletion?: boolean;
}

export type DeleteWeatherStationCommand = WeatherDomainCommand<
	'weather.deleteWeatherStation',
	WeatherCommandPayload &
		ExpectedUpdatedAtPayload & {
			readonly weatherStationId: DomainId;
			readonly acknowledgedSummaryDeletion: boolean;
		}
>;

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

export interface CommitWeatherSummaryImportCommandInput extends WeatherCommandInput {
	readonly weatherStationId: DomainId;
	readonly rows: readonly WeatherSummaryImportRowInput[];
	readonly acknowledgedUpdates?: boolean;
	readonly acknowledgedPartialImport?: boolean;
}

export type CommitWeatherSummaryImportCommand = WeatherDomainCommand<
	'weather.commitWeatherSummaryImport',
	WeatherCommandPayload & {
		readonly weatherStationId: DomainId;
		readonly rows: readonly NormalizedWeatherSummaryImportRow[];
		readonly acknowledgedUpdates: boolean;
		readonly acknowledgedPartialImport: boolean;
	}
>;

export type WeatherCommand =
	| CreateWeatherStationCommand
	| UpdateWeatherStationDetailsCommand
	| UpdateWeatherStationLocationCommand
	| DeactivateWeatherStationCommand
	| ReactivateWeatherStationCommand
	| DeleteWeatherStationCommand
	| CreateWeatherSummaryCommand
	| UpdateWeatherSummaryCommand
	| DeleteWeatherSummaryCommand
	| CommitWeatherSummaryImportCommand;

export function deriveWeatherStationStatus(input: WeatherStationStatusInput): WeatherStationStatus {
	if (input.deletedAt !== undefined && input.deletedAt !== null) {
		return 'deleted';
	}
	return input.isActive ? 'active' : 'inactive';
}

export function isSingleDayWeatherBucket(input: {
	readonly startDate: LocalDateString;
	readonly endDate: LocalDateString;
}): boolean {
	return input.startDate === input.endDate;
}

export function createWeatherStationCommand(
	input: CreateWeatherStationCommandInput,
): CreateWeatherStationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherStationId, 'weatherStationId', issues);
	const stationName = normalizeRequiredText(input.stationName, 'stationName', issues, 200);
	const stationCode = normalizeNullableText(input.stationCode, 'stationCode', issues, 100);
	const geometry = validatePointGeometry(input.geometry, 'geometry', issues);
	const metadata = normalizeJsonObject(input.metadata, 'metadata', issues);
	throwIfIssues('Create weather station command is invalid.', issues);
	return {
		type: 'weather.createWeatherStation',
		payload: {
			...basePayload(input),
			weatherStationId: normalizeRequiredId(input.weatherStationId),
			stationName,
			stationCode,
			geometry,
			metadata,
		},
	};
}

export function updateWeatherStationDetailsCommand(
	input: UpdateWeatherStationDetailsCommandInput,
): UpdateWeatherStationDetailsCommand {
	const issues = validateStationIdCommand(input);
	const hasName = input.stationName !== undefined;
	const hasCode = input.stationCode !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasName && !hasCode && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one station detail must change.' });
	}
	const stationName = hasName
		? normalizeRequiredText(input.stationName, 'stationName', issues, 200)
		: undefined;
	const stationCode = hasCode
		? normalizeNullableText(input.stationCode, 'stationCode', issues, 100)
		: undefined;
	const metadata = hasMetadata
		? normalizeJsonObject(input.metadata, 'metadata', issues)
		: undefined;
	throwIfIssues('Update weather station details command is invalid.', issues);
	return {
		type: 'weather.updateWeatherStationDetails',
		payload: {
			...basePayload(input),
			expectedUpdatedAt: normalizeExpectedUpdatedAt(
				input.expectedUpdatedAt,
				'expectedUpdatedAt',
				createIssues(),
			),
			weatherStationId: normalizeRequiredId(input.weatherStationId),
			changes: {
				...(stationName !== undefined ? { stationName } : {}),
				...(hasCode ? { stationCode: stationCode ?? null } : {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
			acknowledgedHistoricalStationIdentityChange:
				input.acknowledgedHistoricalStationIdentityChange ?? false,
		},
	};
}

export function updateWeatherStationLocationCommand(
	input: UpdateWeatherStationLocationCommandInput,
): UpdateWeatherStationLocationCommand {
	const issues = validateStationIdCommand(input);
	const geometry = validatePointGeometry(input.geometry, 'geometry', issues);
	throwIfIssues('Update weather station location command is invalid.', issues);
	return {
		type: 'weather.updateWeatherStationLocation',
		payload: {
			...basePayload(input),
			expectedUpdatedAt: normalizeExpectedUpdatedAt(
				input.expectedUpdatedAt,
				'expectedUpdatedAt',
				createIssues(),
			),
			weatherStationId: normalizeRequiredId(input.weatherStationId),
			geometry,
			acknowledgedHistoricalLocationChange: input.acknowledgedHistoricalLocationChange ?? false,
		},
	};
}

export function deactivateWeatherStationCommand(
	input: WeatherStationIdCommandInput,
): DeactivateWeatherStationCommand {
	return stationLifecycleCommand('weather.deactivateWeatherStation', input);
}

export function reactivateWeatherStationCommand(
	input: WeatherStationIdCommandInput,
): ReactivateWeatherStationCommand {
	return stationLifecycleCommand('weather.reactivateWeatherStation', input);
}

export function deleteWeatherStationCommand(
	input: DeleteWeatherStationCommandInput,
): DeleteWeatherStationCommand {
	const issues = validateStationIdCommand(input);
	throwIfIssues('Delete weather station command is invalid.', issues);
	return {
		type: 'weather.deleteWeatherStation',
		payload: {
			...basePayload(input),
			expectedUpdatedAt: normalizeExpectedUpdatedAt(
				input.expectedUpdatedAt,
				'expectedUpdatedAt',
				createIssues(),
			),
			weatherStationId: normalizeRequiredId(input.weatherStationId),
			acknowledgedSummaryDeletion: input.acknowledgedSummaryDeletion ?? false,
		},
	};
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
			weatherStationId: normalizeRequiredId(input.weatherStationId),
			weatherSummaryId: normalizeRequiredId(input.weatherSummaryId),
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
			weatherSummaryId: normalizeRequiredId(input.weatherSummaryId),
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
			weatherSummaryId: normalizeRequiredId(input.weatherSummaryId),
		},
	};
}

export function commitWeatherSummaryImportCommand(
	input: CommitWeatherSummaryImportCommandInput,
): CommitWeatherSummaryImportCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherStationId, 'weatherStationId', issues);
	validateImportRowsShape(input.rows, issues);
	const assessment = assessWeatherSummaryImportRows({ rows: input.rows });
	for (const [index, assessmentRow] of assessment.rows.entries()) {
		for (const issue of assessmentRow.issues) {
			issues.push({ path: `rows.${index}.${issue.path}`, message: issue.message });
		}
	}
	throwIfIssues('Commit weather summary import command is invalid.', issues);
	return {
		type: 'weather.commitWeatherSummaryImport',
		payload: {
			...basePayload(input),
			weatherStationId: normalizeRequiredId(input.weatherStationId),
			rows: input.rows.map((row, index) => normalizeImportRow(row, index, createIssues()).row),
			acknowledgedUpdates: input.acknowledgedUpdates ?? false,
			acknowledgedPartialImport: input.acknowledgedPartialImport ?? false,
		},
	};
}

export function assessWeatherSummaryImportRows(
	input: AssessWeatherSummaryImportRowsInput,
): WeatherSummaryImportAssessment {
	const existingSummaries = input.existingSummaries ?? [];
	const mutableAcceptedRanges: NormalizedWeatherSummaryImportRow[] = [];
	const clientRowIds = new Set<string>();
	const proposedSummaryIds = new Set<string>();
	const rows: WeatherSummaryImportRowAssessment[] = [];
	const counts: Record<WeatherImportAssessmentAction, number> = {
		insert: 0,
		update: 0,
		noChange: 0,
		fail: 0,
	};

	validateOptionalCurrentLocalDate(input.currentLocalDate);

	input.rows.forEach((rowInput, index) => {
		const issues = createIssues();
		const normalized = normalizeImportRow(rowInput, index, issues).row;
		if (clientRowIds.has(normalized.clientRowId)) {
			issues.push({
				path: 'clientRowId',
				message: 'clientRowId values must be unique within an import.',
			});
		}
		if (proposedSummaryIds.has(normalized.weatherSummaryId)) {
			issues.push({
				path: 'weatherSummaryId',
				message: 'weatherSummaryId values must be unique within an import.',
			});
		}
		clientRowIds.add(normalized.clientRowId);
		proposedSummaryIds.add(normalized.weatherSummaryId);

		if (
			input.currentLocalDate !== undefined &&
			normalized.endDate.length > 0 &&
			normalized.endDate > input.currentLocalDate
		) {
			issues.push({ path: 'endDate', message: 'Weather summary date cannot be in the future.' });
		}

		const priorPayloadOverlap = mutableAcceptedRanges.find((accepted) =>
			rangesOverlap(normalized, accepted),
		);
		if (priorPayloadOverlap !== undefined) {
			issues.push({
				path: 'dateRange',
				message:
					priorPayloadOverlap.startDate === normalized.startDate &&
					priorPayloadOverlap.endDate === normalized.endDate
						? 'Date bucket is duplicated within the import.'
						: 'Date bucket overlaps another row in the import.',
			});
		}

		const exactExisting = existingSummaries.find(
			(existing) =>
				existing.startDate === normalized.startDate && existing.endDate === normalized.endDate,
		);
		const overlappingExisting = existingSummaries.find(
			(existing) => exactExisting === undefined && rangesOverlap(normalized, existing),
		);
		if (overlappingExisting !== undefined) {
			issues.push({
				path: 'dateRange',
				message: 'Date bucket overlaps an existing weather summary.',
			});
		}

		let action: WeatherImportAssessmentAction = 'fail';
		let weatherSummaryId: DomainId | null = null;
		if (issues.length === 0) {
			if (exactExisting === undefined) {
				action = 'insert';
				weatherSummaryId = normalized.weatherSummaryId;
			} else if (metricsEqual(normalized, exactExisting)) {
				action = 'noChange';
				weatherSummaryId = exactExisting.weatherSummaryId;
			} else {
				action = 'update';
				weatherSummaryId = exactExisting.weatherSummaryId;
			}
			mutableAcceptedRanges.push(normalized);
		}

		counts[action] += 1;
		rows.push({
			clientRowId: normalized.clientRowId,
			submittedWeatherSummaryId: normalized.weatherSummaryId,
			weatherSummaryId,
			startDate: normalized.startDate,
			endDate: normalized.endDate,
			action,
			issues,
		});
	});

	return {
		rows,
		counts,
	};
}

function stationLifecycleCommand<
	TType extends 'weather.deactivateWeatherStation' | 'weather.reactivateWeatherStation',
>(
	type: TType,
	input: WeatherStationIdCommandInput,
): WeatherDomainCommand<
	TType,
	WeatherCommandPayload & ExpectedUpdatedAtPayload & { readonly weatherStationId: DomainId }
> {
	const issues = validateStationIdCommand(input);
	throwIfIssues(`${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			expectedUpdatedAt: normalizeExpectedUpdatedAt(
				input.expectedUpdatedAt,
				'expectedUpdatedAt',
				createIssues(),
			),
			weatherStationId: normalizeRequiredId(input.weatherStationId),
		},
	};
}

function validateBase(input: WeatherCommandInput, issues: DomainValidationIssue[]): void {
	validateAgencyCommandContext(input, issues);
}

function validateStationIdCommand(input: WeatherStationIdCommandInput): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherStationId, 'weatherStationId', issues);
	normalizeExpectedUpdatedAt(input.expectedUpdatedAt, 'expectedUpdatedAt', issues);
	return issues;
}

function basePayload(input: WeatherCommandInput): WeatherCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

function validateImportRowsShape(
	rows: readonly WeatherSummaryImportRowInput[],
	issues: DomainValidationIssue[],
): void {
	if (!Array.isArray(rows) || rows.length === 0) {
		issues.push({ path: 'rows', message: 'rows must include at least one row.' });
		return;
	}
	if (rows.length > MAX_WEATHER_IMPORT_ROWS) {
		issues.push({
			path: 'rows',
			message: `rows must include ${MAX_WEATHER_IMPORT_ROWS} rows or fewer.`,
		});
	}
}

function normalizeImportRow(
	rowInput: WeatherSummaryImportRowInput,
	index: number,
	issues: DomainValidationIssue[],
): { readonly row: NormalizedWeatherSummaryImportRow } {
	const path = `rows.${index}`;
	if (!isRecord(rowInput)) {
		issues.push({ path, message: 'Import row must be an object.' });
		return {
			row: {
				clientRowId: '',
				weatherSummaryId: '',
				startDate: '',
				endDate: '',
				...emptyMetrics(),
			},
		};
	}
	const rowIssues = createIssues();
	const clientRowId = normalizeRequiredText(rowInput.clientRowId, 'clientRowId', rowIssues, 200);
	requireUuid(rowInput.weatherSummaryId, 'weatherSummaryId', rowIssues);
	validateDateRange(rowInput.startDate, rowInput.endDate, rowIssues);
	const metrics = normalizeSummaryMetrics(rowInput, '', rowIssues);
	validateMetricSet(metrics, rowIssues);
	issues.push(...rowIssues);
	return {
		row: {
			clientRowId,
			weatherSummaryId: normalizeRequiredId(rowInput.weatherSummaryId),
			startDate: rowInput.startDate,
			endDate: rowInput.endDate,
			...metrics,
		},
	};
}

function validateDateRange(
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

function normalizeSummaryMetrics(
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

function normalizeMetricPatch(
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

type MutableMetricPatch = {
	-readonly [K in keyof WeatherSummaryMetrics]?: WeatherSummaryMetrics[K];
};

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

function validateMetricSet(metrics: WeatherSummaryMetrics, issues: DomainValidationIssue[]): void {
	if (WEATHER_SUMMARY_METRIC_FIELDS.every((field) => metrics[field] === null)) {
		issues.push({ path: 'metrics', message: 'At least one weather metric is required.' });
	}
	validateMetricPairOrdering(metrics, issues);
}

function validateMetricPairOrdering(
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

function metricsEqual(a: WeatherSummaryMetrics, b: WeatherSummaryMetrics): boolean {
	return WEATHER_SUMMARY_METRIC_FIELDS.every((field) => a[field] === b[field]);
}

function rangesOverlap(
	a: { readonly startDate: LocalDateString; readonly endDate: LocalDateString },
	b: { readonly startDate: LocalDateString; readonly endDate: LocalDateString },
): boolean {
	return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

function emptyMetrics(): WeatherSummaryMetrics {
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

function validatePointGeometry(
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

function normalizeExpectedUpdatedAt(
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

function validateLocalDate(
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

function validateOptionalCurrentLocalDate(value: LocalDateString | undefined): void {
	if (value === undefined) {
		return;
	}
	const issues = createIssues();
	validateLocalDate(value, 'currentLocalDate', issues);
	if (issues.length > 0) {
		throw new DomainValidationError('Current local date is invalid.', issues);
	}
}

function isLocalDateString(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function hasMaxDecimalPlaces(value: number, places: number): boolean {
	const factor = 10 ** places;
	const scaled = value * factor;
	return Math.abs(scaled - Math.round(scaled)) < Number.EPSILON * factor;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function humanizeCommandType(type: string): string {
	const command = type.split('.').at(-1) ?? type;
	return command.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
