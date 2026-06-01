import {
	createIssues,
	jsonObject as normalizeJsonObject,
	nullableText as normalizeNullableText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue, GeoJsonPoint, JsonObject } from '../shared.js';
import {
	basePayload,
	type ExpectedUpdatedAtInput,
	type ExpectedUpdatedAtPayload,
	normalizeExpectedUpdatedAt,
	normalizeRequiredDomainId,
	validateBase,
	validatePointGeometry,
	type WeatherCommandInput,
	type WeatherCommandPayload,
	type WeatherDomainCommand,
} from './shared.js';

export type WeatherStationStatus = 'active' | 'inactive' | 'deleted';

export interface WeatherStationStatusInput {
	readonly isActive: boolean;
	readonly deletedAt?: Date | string | null;
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

export function deriveWeatherStationStatus(input: WeatherStationStatusInput): WeatherStationStatus {
	if (input.deletedAt !== undefined && input.deletedAt !== null) {
		return 'deleted';
	}
	return input.isActive ? 'active' : 'inactive';
}

export function createWeatherStationCommand(
	input: CreateWeatherStationCommandInput,
): CreateWeatherStationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherStationId, 'weatherStationId', issues);
	const stationName = normalizeRequiredStationText(input.stationName, 'stationName', issues, 200);
	const stationCode = normalizeNullableText(input.stationCode, 'stationCode', issues, 100);
	const geometry = validatePointGeometry(input.geometry, 'geometry', issues);
	const metadata = normalizeJsonObject(input.metadata, 'metadata', issues);
	throwIfIssues('Create weather station command is invalid.', issues);
	return {
		type: 'weather.createWeatherStation',
		payload: {
			...basePayload(input),
			weatherStationId: normalizeRequiredDomainId(input.weatherStationId),
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
		? normalizeRequiredStationText(input.stationName, 'stationName', issues, 200)
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
			weatherStationId: normalizeRequiredDomainId(input.weatherStationId),
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
			weatherStationId: normalizeRequiredDomainId(input.weatherStationId),
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
			weatherStationId: normalizeRequiredDomainId(input.weatherStationId),
			acknowledgedSummaryDeletion: input.acknowledgedSummaryDeletion ?? false,
		},
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
			weatherStationId: normalizeRequiredDomainId(input.weatherStationId),
		},
	};
}

function validateStationIdCommand(input: WeatherStationIdCommandInput): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.weatherStationId, 'weatherStationId', issues);
	normalizeExpectedUpdatedAt(input.expectedUpdatedAt, 'expectedUpdatedAt', issues);
	return issues;
}

function normalizeRequiredStationText(
	value: string | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		issues.push({ path, message: `${path} must be a non-empty string.` });
		return '';
	}
	const normalized = value.trim();
	if (normalized.length > maxLength) {
		issues.push({ path, message: `${path} must be ${maxLength} characters or fewer.` });
	}
	return normalized;
}

function humanizeCommandType(type: string): string {
	const command = type.split('.').at(-1) ?? type;
	return command.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
