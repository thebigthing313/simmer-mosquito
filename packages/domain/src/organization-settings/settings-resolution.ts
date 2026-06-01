import { createIssues } from '../command-validation.js';
import type { DomainValidationIssue } from '../shared.js';
import { resolveLarvalInspectionEntryPolicy } from './larval-inspection-policy.js';
import {
	type AdultCollectionTimingMode,
	DEFAULT_ADULT_COLLECTION_TIMING_MODE,
	DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY,
	DEFAULT_ORGANIZATION_SETTINGS,
	DEFAULT_ORGANIZATION_TIMEZONE,
	DEFAULT_SERVICE_REQUEST_CONTEXT,
	DEFAULT_UNIT_DEFAULTS,
	type LarvalInspectionEntryPolicy,
	ORGANIZATION_SETTINGS_SCHEMA_VERSION,
	type OrganizationSettingsJson,
	type ResolvedLarvalInspectionEntryPolicy,
	type ResolvedOrganizationSettings,
	type ServiceRequestContextSettings,
	type UnitDefaults,
	type UnitType,
} from './types-and-defaults.js';

const UNIT_TYPES = [
	'weight',
	'distance',
	'area',
	'volume',
	'temperature',
	'duration',
	'count',
	'speed',
] as const;

export function resolveOrganizationSettings(raw: unknown): ResolvedOrganizationSettings {
	const issues = createIssues();
	const source = isPlainObject(raw) ? raw : {};
	if (raw !== null && raw !== undefined && !isPlainObject(raw)) {
		issues.push({
			path: 'settings',
			message: 'Settings must be a JSON object; defaults were used.',
		});
	}

	const timezone = resolveTimezone(source.timezone, issues, 'timezone');
	const unitDefaults = resolveUnitDefaults(source.unitDefaults, issues, 'unitDefaults');
	const adultSurveillance = isPlainObject(source.adultSurveillance) ? source.adultSurveillance : {};
	const larvalSurveillance = isPlainObject(source.larvalSurveillance)
		? source.larvalSurveillance
		: {};
	const controlOperations = isPlainObject(source.controlOperations) ? source.controlOperations : {};
	const publicEngagement = isPlainObject(source.publicEngagement) ? source.publicEngagement : {};

	if (source.adultSurveillance !== undefined && !isPlainObject(source.adultSurveillance)) {
		issues.push({
			path: 'adultSurveillance',
			message: 'Adult surveillance settings must be an object; defaults were used.',
		});
	}
	if (source.larvalSurveillance !== undefined && !isPlainObject(source.larvalSurveillance)) {
		issues.push({
			path: 'larvalSurveillance',
			message: 'Larval surveillance settings must be an object; defaults were used.',
		});
	}
	if (source.controlOperations !== undefined && !isPlainObject(source.controlOperations)) {
		issues.push({
			path: 'controlOperations',
			message: 'Control operations settings must be an object; defaults were used.',
		});
	}
	if (source.publicEngagement !== undefined && !isPlainObject(source.publicEngagement)) {
		issues.push({
			path: 'publicEngagement',
			message: 'Public engagement settings must be an object; defaults were used.',
		});
	}

	return {
		settings: {
			schemaVersion: ORGANIZATION_SETTINGS_SCHEMA_VERSION,
			timezone,
			unitDefaults,
			adultSurveillance: {
				collectionTimingMode: resolveAdultCollectionTimingMode(
					adultSurveillance.collectionTimingMode,
					issues,
				),
			},
			larvalSurveillance: {
				inspectionEntryPolicy: resolveLarvalPolicyFromRaw(
					larvalSurveillance.inspectionEntryPolicy,
					issues,
				),
			},
			controlOperations: {
				trackInsecticideBatches: resolveBoolean(
					controlOperations.trackInsecticideBatches,
					DEFAULT_ORGANIZATION_SETTINGS.controlOperations.trackInsecticideBatches,
					'controlOperations.trackInsecticideBatches',
					issues,
				),
			},
			publicEngagement: {
				serviceRequestContext: resolveServiceRequestContext(
					publicEngagement.serviceRequestContext,
					issues,
				),
			},
		},
		issues,
	};
}

export function mergeOrganizationSettingsChange(
	raw: unknown,
	change:
		| { readonly kind: 'timezone'; readonly timezone: string }
		| { readonly kind: 'unitDefaults'; readonly unitDefaults: UnitDefaults }
		| {
				readonly kind: 'adultCollectionTimingMode';
				readonly collectionTimingMode: AdultCollectionTimingMode;
		  }
		| {
				readonly kind: 'larvalInspectionEntryPolicy';
				readonly policy: ResolvedLarvalInspectionEntryPolicy;
		  }
		| { readonly kind: 'insecticideBatchTracking'; readonly trackInsecticideBatches: boolean }
		| {
				readonly kind: 'serviceRequestContext';
				readonly serviceRequestContext: ServiceRequestContextSettings;
		  },
): OrganizationSettingsJson {
	const base = isPlainObject(raw) ? cloneObject(raw) : {};
	const resolved = resolveOrganizationSettings(raw).settings;
	base.schemaVersion = ORGANIZATION_SETTINGS_SCHEMA_VERSION;
	base.timezone = resolved.timezone;
	base.unitDefaults = { ...resolved.unitDefaults };
	const resolvedAdultSurveillance = isPlainObject(base.adultSurveillance)
		? cloneObject(base.adultSurveillance)
		: {};
	resolvedAdultSurveillance.collectionTimingMode = resolved.adultSurveillance.collectionTimingMode;
	base.adultSurveillance = resolvedAdultSurveillance;
	const resolvedLarvalSurveillance = isPlainObject(base.larvalSurveillance)
		? cloneObject(base.larvalSurveillance)
		: {};
	resolvedLarvalSurveillance.inspectionEntryPolicy = cloneLarvalInspectionEntryPolicy(
		resolved.larvalSurveillance.inspectionEntryPolicy,
	);
	base.larvalSurveillance = resolvedLarvalSurveillance;
	const resolvedControlOperations = isPlainObject(base.controlOperations)
		? cloneObject(base.controlOperations)
		: {};
	resolvedControlOperations.trackInsecticideBatches =
		resolved.controlOperations.trackInsecticideBatches;
	base.controlOperations = resolvedControlOperations;
	const resolvedPublicEngagement = isPlainObject(base.publicEngagement)
		? cloneObject(base.publicEngagement)
		: {};
	resolvedPublicEngagement.serviceRequestContext = cloneServiceRequestContext(
		resolved.publicEngagement.serviceRequestContext,
	);
	base.publicEngagement = resolvedPublicEngagement;
	switch (change.kind) {
		case 'timezone':
			base.timezone = change.timezone;
			break;
		case 'unitDefaults':
			base.unitDefaults = { ...change.unitDefaults };
			break;
		case 'adultCollectionTimingMode': {
			const adultSurveillance = isPlainObject(base.adultSurveillance)
				? cloneObject(base.adultSurveillance)
				: {};
			adultSurveillance.collectionTimingMode = change.collectionTimingMode;
			base.adultSurveillance = adultSurveillance;
			break;
		}
		case 'larvalInspectionEntryPolicy': {
			const larvalSurveillance = isPlainObject(base.larvalSurveillance)
				? cloneObject(base.larvalSurveillance)
				: {};
			larvalSurveillance.inspectionEntryPolicy = cloneLarvalInspectionEntryPolicy(change.policy);
			base.larvalSurveillance = larvalSurveillance;
			break;
		}
		case 'insecticideBatchTracking': {
			const controlOperations = isPlainObject(base.controlOperations)
				? cloneObject(base.controlOperations)
				: {};
			controlOperations.trackInsecticideBatches = change.trackInsecticideBatches;
			base.controlOperations = controlOperations;
			break;
		}
		case 'serviceRequestContext': {
			const publicEngagement = isPlainObject(base.publicEngagement)
				? cloneObject(base.publicEngagement)
				: {};
			publicEngagement.serviceRequestContext = cloneServiceRequestContext(
				change.serviceRequestContext,
			);
			base.publicEngagement = publicEngagement;
			break;
		}
	}
	return base;
}

function resolveLarvalPolicyFromRaw(
	value: unknown,
	issues: DomainValidationIssue[],
): ResolvedLarvalInspectionEntryPolicy {
	if (value === undefined || value === null) {
		return DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY;
	}
	if (!isPlainObject(value)) {
		issues.push({
			path: 'larvalSurveillance.inspectionEntryPolicy',
			message: 'Larval inspection entry policy must be an object; defaults were used.',
		});
		return DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY;
	}
	const policy = resolveLarvalInspectionEntryPolicy(
		value as unknown as LarvalInspectionEntryPolicy,
		issues,
		'larvalSurveillance.inspectionEntryPolicy',
	);
	if (issues.some((issue) => issue.path.startsWith('larvalSurveillance.inspectionEntryPolicy'))) {
		return DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY;
	}
	return policy;
}

function resolveAdultCollectionTimingMode(
	value: unknown,
	issues: DomainValidationIssue[],
): AdultCollectionTimingMode {
	if (value === undefined || value === null) {
		return DEFAULT_ADULT_COLLECTION_TIMING_MODE;
	}
	if (value !== 'exact_timestamps' && value !== 'collection_date_duration') {
		issues.push({
			path: 'adultSurveillance.collectionTimingMode',
			message: 'Unsupported adult collection timing mode; default was used.',
		});
		return DEFAULT_ADULT_COLLECTION_TIMING_MODE;
	}
	return value as AdultCollectionTimingMode;
}

function resolveTimezone(value: unknown, issues: DomainValidationIssue[], path: string): string {
	if (value === undefined || value === null) {
		return DEFAULT_ORGANIZATION_TIMEZONE;
	}
	if (typeof value !== 'string') {
		issues.push({ path, message: 'Timezone must be text; default was used.' });
		return DEFAULT_ORGANIZATION_TIMEZONE;
	}
	const nestedIssues = createIssues();
	const timezone = normalizeTimezone(value, path, nestedIssues);
	if (nestedIssues.length > 0) {
		issues.push({ path, message: 'Unsupported timezone; default was used.' });
		return DEFAULT_ORGANIZATION_TIMEZONE;
	}
	return timezone;
}

function resolveUnitDefaults(
	value: unknown,
	issues: DomainValidationIssue[],
	path: string,
): UnitDefaults {
	if (value === undefined || value === null) {
		return DEFAULT_UNIT_DEFAULTS;
	}
	if (!isPlainObject(value)) {
		issues.push({ path, message: 'Unit defaults must be an object; defaults were used.' });
		return DEFAULT_UNIT_DEFAULTS;
	}
	const resolved: Record<UnitType, string> = { ...DEFAULT_UNIT_DEFAULTS };
	for (const unitType of UNIT_TYPES) {
		const unitCode = value[unitType];
		if (unitCode === undefined || unitCode === null) {
			continue;
		}
		if (typeof unitCode !== 'string' || unitCode.trim().length === 0) {
			issues.push({
				path: `${path}.${unitType}`,
				message: 'Unit default must be a non-empty unit code; default was used.',
			});
			continue;
		}
		resolved[unitType] = unitCode.trim();
	}
	return resolved;
}

function resolveServiceRequestContext(
	value: unknown,
	issues: DomainValidationIssue[],
): ServiceRequestContextSettings {
	if (value === undefined || value === null) {
		return DEFAULT_SERVICE_REQUEST_CONTEXT;
	}
	if (!isPlainObject(value)) {
		issues.push({
			path: 'publicEngagement.serviceRequestContext',
			message: 'Service request context settings must be an object; defaults were used.',
		});
		return DEFAULT_SERVICE_REQUEST_CONTEXT;
	}
	const nestedIssues = createIssues();
	const context = normalizeServiceRequestContext(
		value as unknown as ServiceRequestContextSettings,
		'publicEngagement.serviceRequestContext',
		nestedIssues,
	);
	if (nestedIssues.length > 0) {
		issues.push(...nestedIssues);
		return DEFAULT_SERVICE_REQUEST_CONTEXT;
	}
	return context;
}

function resolveBoolean(
	value: unknown,
	defaultValue: boolean,
	path: string,
	issues: DomainValidationIssue[],
): boolean {
	if (value === undefined || value === null) {
		return defaultValue;
	}
	if (typeof value !== 'boolean') {
		issues.push({ path, message: 'Setting must be a boolean; default was used.' });
		return defaultValue;
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

function cloneLarvalInspectionEntryPolicy(
	policy: ResolvedLarvalInspectionEntryPolicy,
): ResolvedLarvalInspectionEntryPolicy {
	return {
		mode: policy.mode,
		densityRanges:
			policy.densityRanges === null
				? null
				: {
						light: { ...policy.densityRanges.light },
						medium: { ...policy.densityRanges.medium },
						heavy: { ...policy.densityRanges.heavy },
						veryHeavy: { ...policy.densityRanges.veryHeavy },
					},
	};
}

function cloneServiceRequestContext(
	context: ServiceRequestContextSettings,
): ServiceRequestContextSettings {
	return {
		radius: { ...context.radius },
		timeWindow: { ...context.timeWindow },
	};
}

function cloneObject(value: Record<string, unknown>): Record<string, unknown> {
	return { ...value };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
