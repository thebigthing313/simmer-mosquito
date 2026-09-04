import { ADULT_COLLECTION_TIMING_MODES, UNIT_TYPES } from '../column-vocabularies.js';
import {
	createIssues,
	requiredId as normalizeRequiredId,
	throwIfIssues,
	validateAgencyCommandContext,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';
import { resolveLarvalInspectionEntryPolicy } from './larval-inspection-policy.js';
import { normalizeSpeciesKeyBindings } from './species-key-bindings.js';
import {
	type AdultCollectionTimingMode,
	DEFAULT_ADULT_COLLECTION_TIMING_MODE,
	DEFAULT_ORGANIZATION_TIMEZONE,
	DEFAULT_SERVICE_REQUEST_CONTEXT,
	DEFAULT_UNIT_DEFAULTS,
	type ServiceRequestContextSettings,
	type UnitDefaults,
	type UnitType,
	type UpdateAdultCollectionTimingModeCommand,
	type UpdateAdultCollectionTimingModeCommandInput,
	type UpdateInsecticideBatchTrackingCommand,
	type UpdateInsecticideBatchTrackingCommandInput,
	type UpdateLarvalInspectionEntryPolicyCommand,
	type UpdateLarvalInspectionEntryPolicyCommandInput,
	type UpdateServiceRequestContextCommand,
	type UpdateServiceRequestContextCommandInput,
	type UpdateSpeciesKeyBindingsCommand,
	type UpdateSpeciesKeyBindingsCommandInput,
	type UpdateTimezoneCommand,
	type UpdateTimezoneCommandInput,
	type UpdateUnitDefaultsCommand,
	type UpdateUnitDefaultsCommandInput,
} from './types-and-defaults.js';

interface OrganizationSettingsCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
	readonly expectedUpdatedAt?: Date | null;
}

interface OrganizationSettingsCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
	readonly expectedUpdatedAt: Date | null;
}

export function updateTimezoneCommand(input: UpdateTimezoneCommandInput): UpdateTimezoneCommand {
	const issues = validateCommandBase(input);
	const timezone = normalizeTimezone(input.timezone, 'timezone', issues);
	throwIfIssues('Update timezone command is invalid.', issues);
	return {
		type: 'organizationSettings.updateTimezone',
		payload: {
			...basePayload(input),
			timezone,
		},
	};
}

export function updateUnitDefaultsCommand(
	input: UpdateUnitDefaultsCommandInput,
): UpdateUnitDefaultsCommand {
	const issues = validateCommandBase(input);
	const unitDefaults = normalizeUnitDefaults(input.unitDefaults, 'unitDefaults', issues);
	throwIfIssues('Update unit defaults command is invalid.', issues);
	return {
		type: 'organizationSettings.updateUnitDefaults',
		payload: {
			...basePayload(input),
			unitDefaults,
		},
	};
}

export function updateAdultCollectionTimingModeCommand(
	input: UpdateAdultCollectionTimingModeCommandInput,
): UpdateAdultCollectionTimingModeCommand {
	const issues = validateCommandBase(input);
	const collectionTimingMode = normalizeAdultCollectionTimingMode(
		input.collectionTimingMode,
		'collectionTimingMode',
		issues,
	);
	throwIfIssues('Update adult collection timing mode command is invalid.', issues);
	return {
		type: 'organizationSettings.updateAdultCollectionTimingMode',
		payload: {
			...basePayload(input),
			collectionTimingMode,
		},
	};
}

export function updateLarvalInspectionEntryPolicyCommand(
	input: UpdateLarvalInspectionEntryPolicyCommandInput,
): UpdateLarvalInspectionEntryPolicyCommand {
	const issues = validateCommandBase(input);
	const policy = resolveLarvalInspectionEntryPolicy(input.policy, issues, 'policy');
	throwIfIssues('Update larval inspection entry policy command is invalid.', issues);
	return {
		type: 'organizationSettings.updateLarvalInspectionEntryPolicy',
		payload: {
			...basePayload(input),
			policy,
		},
	};
}

export function updateInsecticideBatchTrackingCommand(
	input: UpdateInsecticideBatchTrackingCommandInput,
): UpdateInsecticideBatchTrackingCommand {
	const issues = validateCommandBase(input);
	if (typeof input.trackInsecticideBatches !== 'boolean') {
		issues.push({
			path: 'trackInsecticideBatches',
			message: 'trackInsecticideBatches must be a boolean.',
		});
	}
	throwIfIssues('Update insecticide batch tracking command is invalid.', issues);
	return {
		type: 'organizationSettings.updateInsecticideBatchTracking',
		payload: {
			...basePayload(input),
			trackInsecticideBatches: input.trackInsecticideBatches,
		},
	};
}

export function updateServiceRequestContextCommand(
	input: UpdateServiceRequestContextCommandInput,
): UpdateServiceRequestContextCommand {
	const issues = validateCommandBase(input);
	const serviceRequestContext = normalizeServiceRequestContext(
		input.serviceRequestContext,
		'serviceRequestContext',
		issues,
	);
	throwIfIssues('Update service request context command is invalid.', issues);
	return {
		type: 'organizationSettings.updateServiceRequestContext',
		payload: {
			...basePayload(input),
			serviceRequestContext,
		},
	};
}

export function updateSpeciesKeyBindingsCommand(
	input: UpdateSpeciesKeyBindingsCommandInput,
): UpdateSpeciesKeyBindingsCommand {
	const issues = validateCommandBase(input);
	const speciesKeyBindings = normalizeSpeciesKeyBindings(
		input.speciesKeyBindings,
		'speciesKeyBindings',
		issues,
	);
	throwIfIssues('Update species key bindings command is invalid.', issues);
	return {
		type: 'organizationSettings.updateSpeciesKeyBindings',
		payload: {
			...basePayload(input),
			speciesKeyBindings,
		},
	};
}

function validateCommandBase(input: OrganizationSettingsCommandInput): DomainValidationIssue[] {
	const issues = createIssues();
	validateAgencyCommandContext(input, issues);
	normalizeExpectedUpdatedAt(input.expectedUpdatedAt, 'expectedUpdatedAt', issues);
	return issues;
}

function basePayload(input: OrganizationSettingsCommandInput): OrganizationSettingsCommandPayload {
	return {
		organizationId: normalizeRequiredId(input.organizationId),
		actorProfileId: normalizeRequiredId(input.actorProfileId),
		expectedUpdatedAt: normalizeExpectedUpdatedAt(
			input.expectedUpdatedAt,
			'expectedUpdatedAt',
			createIssues(),
		),
	};
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

function normalizeTimezone(value: string, path: string, issues: DomainValidationIssue[]): string {
	const normalized = normalizeRequiredText(value, path, issues);
	if (normalized.length === 0) {
		return DEFAULT_ORGANIZATION_TIMEZONE;
	}
	try {
		return new Intl.DateTimeFormat('en-US', { timeZone: normalized }).resolvedOptions().timeZone;
	} catch {
		issues.push({ path, message: 'timezone must be a supported IANA timezone.' });
		return DEFAULT_ORGANIZATION_TIMEZONE;
	}
}

function normalizeUnitDefaults(
	value: UnitDefaults,
	path: string,
	issues: DomainValidationIssue[],
): UnitDefaults {
	if (!isPlainObject(value)) {
		issues.push({ path, message: 'unitDefaults must be an object.' });
		return DEFAULT_UNIT_DEFAULTS;
	}
	const normalized: Record<UnitType, string> = { ...DEFAULT_UNIT_DEFAULTS };
	for (const unitType of UNIT_TYPES) {
		normalized[unitType] = normalizeRequiredText(value[unitType], `${path}.${unitType}`, issues);
	}
	for (const key of Object.keys(value)) {
		if (!UNIT_TYPES.includes(key as UnitType)) {
			issues.push({ path: `${path}.${key}`, message: 'Unsupported unit default type.' });
		}
	}
	return normalized;
}

function normalizeAdultCollectionTimingMode(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): AdultCollectionTimingMode {
	if (
		typeof value !== 'string' ||
		!ADULT_COLLECTION_TIMING_MODES.includes(value as AdultCollectionTimingMode)
	) {
		issues.push({ path, message: 'Unsupported adult collection timing mode.' });
		return DEFAULT_ADULT_COLLECTION_TIMING_MODE;
	}
	return value as AdultCollectionTimingMode;
}

function normalizeServiceRequestContext(
	value: ServiceRequestContextSettings,
	path: string,
	issues: DomainValidationIssue[],
): ServiceRequestContextSettings {
	if (!isPlainObject(value)) {
		issues.push({ path, message: 'serviceRequestContext must be an object.' });
		return DEFAULT_SERVICE_REQUEST_CONTEXT;
	}
	const radius: Record<string, unknown> = isPlainObject(value.radius) ? value.radius : {};
	const timeWindow: Record<string, unknown> = isPlainObject(value.timeWindow)
		? value.timeWindow
		: {};
	if (!isPlainObject(value.radius)) {
		issues.push({ path: `${path}.radius`, message: 'radius must be an object.' });
	}
	if (!isPlainObject(value.timeWindow)) {
		issues.push({ path: `${path}.timeWindow`, message: 'timeWindow must be an object.' });
	}
	return {
		radius: {
			amount: normalizePositiveFiniteNumber(radius.amount, `${path}.radius.amount`, issues),
			unitCode: normalizeRequiredText(radius.unitCode, `${path}.radius.unitCode`, issues),
		},
		timeWindow: {
			daysBefore: normalizeNonnegativeInteger(
				timeWindow.daysBefore,
				`${path}.timeWindow.daysBefore`,
				issues,
			),
			daysAfter: normalizeNonnegativeInteger(
				timeWindow.daysAfter,
				`${path}.timeWindow.daysAfter`,
				issues,
			),
		},
	};
}

function normalizePositiveFiniteNumber(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive finite number.` });
		return 0;
	}
	return value;
}

function normalizeNonnegativeInteger(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		issues.push({ path, message: `${path} must be a nonnegative integer.` });
		return 0;
	}
	return value;
}

function normalizeRequiredText(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): string {
	if (typeof value !== 'string') {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		issues.push({ path, message: `${path} is required.` });
	}
	return trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
