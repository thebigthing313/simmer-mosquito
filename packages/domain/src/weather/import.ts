import {
	createIssues,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from '../shared.js';
import {
	basePayload,
	emptyMetrics,
	MAX_WEATHER_IMPORT_ROWS,
	metricsEqual,
	normalizeRequiredDomainId,
	normalizeSummaryMetrics,
	rangesOverlap,
	validateBase,
	validateDateRange,
	validateMetricSet,
	validateOptionalCurrentLocalDate,
	type WeatherCommandInput,
	type WeatherCommandPayload,
	type WeatherDomainCommand,
	type WeatherSummaryMetrics,
} from './shared.js';

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
			weatherStationId: normalizeRequiredDomainId(input.weatherStationId),
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
			weatherSummaryId: normalizeRequiredDomainId(rowInput.weatherSummaryId),
			startDate: rowInput.startDate,
			endDate: rowInput.endDate,
			...metrics,
		},
	};
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
