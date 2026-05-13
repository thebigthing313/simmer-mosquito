import { type DomainId, DomainValidationError, type DomainValidationIssue } from './shared.js';

export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';
export type LarvalInspectionEntryMode = 'density_only' | 'count_and_dips_required' | 'hybrid';

export interface LarvalDensityRange {
	readonly minInclusive: number;
	readonly maxExclusive?: number | null;
}

export interface LarvalDensityRanges {
	readonly light: LarvalDensityRange;
	readonly medium: LarvalDensityRange;
	readonly heavy: LarvalDensityRange;
	readonly veryHeavy: LarvalDensityRange;
}

export interface LarvalInspectionEntryPolicy {
	readonly mode?: LarvalInspectionEntryMode;
	readonly densityRanges?: LarvalDensityRanges | null;
}

export type ResolvedLarvalInspectionEntryPolicy = Required<LarvalInspectionEntryPolicy>;

export type UnitType =
	| 'weight'
	| 'distance'
	| 'area'
	| 'volume'
	| 'temperature'
	| 'duration'
	| 'count'
	| 'speed';

export type UnitDefaults = Readonly<Record<UnitType, string>>;

export interface ServiceRequestContextSettings {
	readonly radius: Readonly<{
		readonly amount: number;
		readonly unitCode: string;
	}>;
	readonly timeWindow: Readonly<{
		readonly daysBefore: number;
		readonly daysAfter: number;
	}>;
}

export interface OrganizationSettings {
	readonly schemaVersion: 1;
	readonly timezone: string;
	readonly unitDefaults: UnitDefaults;
	readonly larvalSurveillance: Readonly<{
		readonly inspectionEntryPolicy: ResolvedLarvalInspectionEntryPolicy;
	}>;
	readonly controlOperations: Readonly<{
		readonly trackInsecticideBatches: boolean;
	}>;
	readonly publicEngagement: Readonly<{
		readonly serviceRequestContext: ServiceRequestContextSettings;
	}>;
}

export type OrganizationSettingsJson = Readonly<Record<string, unknown>>;

export interface ResolvedOrganizationSettings {
	readonly settings: OrganizationSettings;
	readonly issues: readonly DomainValidationIssue[];
}

export type OrganizationSettingsCommandType =
	| 'organizationSettings.updateTimezone'
	| 'organizationSettings.updateUnitDefaults'
	| 'organizationSettings.updateLarvalInspectionEntryPolicy'
	| 'organizationSettings.updateInsecticideBatchTracking'
	| 'organizationSettings.updateServiceRequestContext';

export interface OrganizationSettingsDomainCommand<
	TType extends OrganizationSettingsCommandType,
	TPayload,
> {
	readonly type: TType;
	readonly payload: TPayload;
}

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

export interface UpdateTimezoneCommandInput extends OrganizationSettingsCommandInput {
	readonly timezone: string;
}

export type UpdateTimezoneCommand = OrganizationSettingsDomainCommand<
	'organizationSettings.updateTimezone',
	OrganizationSettingsCommandPayload & { readonly timezone: string }
>;

export interface UpdateUnitDefaultsCommandInput extends OrganizationSettingsCommandInput {
	readonly unitDefaults: UnitDefaults;
}

export type UpdateUnitDefaultsCommand = OrganizationSettingsDomainCommand<
	'organizationSettings.updateUnitDefaults',
	OrganizationSettingsCommandPayload & { readonly unitDefaults: UnitDefaults }
>;

export interface UpdateLarvalInspectionEntryPolicyCommandInput
	extends OrganizationSettingsCommandInput {
	readonly policy: LarvalInspectionEntryPolicy;
}

export type UpdateLarvalInspectionEntryPolicyCommand = OrganizationSettingsDomainCommand<
	'organizationSettings.updateLarvalInspectionEntryPolicy',
	OrganizationSettingsCommandPayload & { readonly policy: ResolvedLarvalInspectionEntryPolicy }
>;

export interface UpdateInsecticideBatchTrackingCommandInput
	extends OrganizationSettingsCommandInput {
	readonly trackInsecticideBatches: boolean;
}

export type UpdateInsecticideBatchTrackingCommand = OrganizationSettingsDomainCommand<
	'organizationSettings.updateInsecticideBatchTracking',
	OrganizationSettingsCommandPayload & { readonly trackInsecticideBatches: boolean }
>;

export interface UpdateServiceRequestContextCommandInput extends OrganizationSettingsCommandInput {
	readonly serviceRequestContext: ServiceRequestContextSettings;
}

export type UpdateServiceRequestContextCommand = OrganizationSettingsDomainCommand<
	'organizationSettings.updateServiceRequestContext',
	OrganizationSettingsCommandPayload & {
		readonly serviceRequestContext: ServiceRequestContextSettings;
	}
>;

export type OrganizationSettingsCommand =
	| UpdateTimezoneCommand
	| UpdateUnitDefaultsCommand
	| UpdateLarvalInspectionEntryPolicyCommand
	| UpdateInsecticideBatchTrackingCommand
	| UpdateServiceRequestContextCommand;

export const ORGANIZATION_SETTINGS_SCHEMA_VERSION = 1;
export const DEFAULT_ORGANIZATION_TIMEZONE = 'America/New_York';

export const DEFAULT_UNIT_DEFAULTS: UnitDefaults = {
	weight: 'pound',
	distance: 'mile',
	area: 'acre',
	volume: 'gallon',
	temperature: 'fahrenheit',
	duration: 'hour',
	count: 'count',
	speed: 'mph',
} as const;

export const DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY: ResolvedLarvalInspectionEntryPolicy = {
	mode: 'hybrid',
	densityRanges: null,
} as const;

export const DEFAULT_SERVICE_REQUEST_CONTEXT: ServiceRequestContextSettings = {
	radius: {
		amount: 0.25,
		unitCode: 'mile',
	},
	timeWindow: {
		daysBefore: 14,
		daysAfter: 14,
	},
} as const;

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
	schemaVersion: ORGANIZATION_SETTINGS_SCHEMA_VERSION,
	timezone: DEFAULT_ORGANIZATION_TIMEZONE,
	unitDefaults: DEFAULT_UNIT_DEFAULTS,
	larvalSurveillance: {
		inspectionEntryPolicy: DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY,
	},
	controlOperations: {
		trackInsecticideBatches: true,
	},
	publicEngagement: {
		serviceRequestContext: DEFAULT_SERVICE_REQUEST_CONTEXT,
	},
} as const;

const LARVAL_DENSITIES = ['none', 'light', 'medium', 'heavy', 'very_heavy'] as const;
const RANGE_DENSITIES = ['light', 'medium', 'heavy', 'very_heavy'] as const;
const LARVAL_INSPECTION_ENTRY_MODES = [
	'density_only',
	'count_and_dips_required',
	'hybrid',
] as const;
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

export function validateLarvalInspectionEntryPolicy(
	policy: LarvalInspectionEntryPolicy | null | undefined,
): ResolvedLarvalInspectionEntryPolicy {
	const issues = createIssues();
	const resolved = resolveLarvalInspectionEntryPolicy(policy, issues, 'policy');
	throwIfIssues('Larval inspection entry policy is invalid.', issues);
	return resolved;
}

export function resolveLarvalInspectionEntryPolicy(
	policy: LarvalInspectionEntryPolicy | null | undefined,
	issues: DomainValidationIssue[] = createIssues(),
	path = 'policy',
): ResolvedLarvalInspectionEntryPolicy {
	const mode = policy?.mode ?? DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY.mode;
	if (!LARVAL_INSPECTION_ENTRY_MODES.includes(mode)) {
		issues.push({ path: `${path}.mode`, message: 'Unsupported larval inspection entry mode.' });
	}
	const densityRanges = policy?.densityRanges ?? null;
	if (densityRanges !== null) {
		validateDensityRanges(densityRanges, `${path}.densityRanges`, issues);
	}
	return {
		mode: LARVAL_INSPECTION_ENTRY_MODES.includes(mode)
			? mode
			: DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY.mode,
		densityRanges,
	};
}

export function isLarvalDensity(value: unknown): value is LarvalDensity {
	return typeof value === 'string' && LARVAL_DENSITIES.includes(value as LarvalDensity);
}

export function inferLarvalDensity(
	larvaeCount: number,
	dipCount: number,
	ranges: LarvalDensityRanges,
	path: string,
	issues: DomainValidationIssue[],
): LarvalDensity | null {
	if (larvaeCount === 0) {
		return 'none';
	}
	const rate = larvaeCount / dipCount;
	for (const density of RANGE_DENSITIES) {
		const range = ranges[density === 'very_heavy' ? 'veryHeavy' : density];
		if (
			rate >= range.minInclusive &&
			(range.maxExclusive === undefined || range.maxExclusive === null || rate < range.maxExclusive)
		) {
			return density;
		}
	}
	issues.push({ path, message: 'Configured density ranges did not match larvae per dip.' });
	return null;
}

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
	const larvalSurveillance = isPlainObject(source.larvalSurveillance)
		? source.larvalSurveillance
		: {};
	const controlOperations = isPlainObject(source.controlOperations) ? source.controlOperations : {};
	const publicEngagement = isPlainObject(source.publicEngagement) ? source.publicEngagement : {};

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

function validateDensityRanges(
	ranges: LarvalDensityRanges,
	path: string,
	issues: DomainValidationIssue[],
): void {
	let previousMax: number | null = null;
	for (const density of RANGE_DENSITIES) {
		const range = ranges[density === 'very_heavy' ? 'veryHeavy' : density];
		if (range === undefined) {
			issues.push({ path: `${path}.${density}`, message: `${density} range is required.` });
			continue;
		}
		if (!Number.isFinite(range.minInclusive) || range.minInclusive < 0) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'minInclusive must be a finite number greater than or equal to zero.',
			});
		}
		const maxExclusive = range.maxExclusive ?? null;
		if (
			maxExclusive !== null &&
			(!Number.isFinite(maxExclusive) || maxExclusive <= range.minInclusive)
		) {
			issues.push({
				path: `${path}.${density}.maxExclusive`,
				message: 'maxExclusive must be greater than minInclusive when present.',
			});
		}
		if (previousMax === null && range.minInclusive !== 0) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'The first density range must start at zero.',
			});
		}
		if (previousMax !== null && range.minInclusive !== previousMax) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'Density ranges must be contiguous.',
			});
		}
		previousMax = maxExclusive;
	}
	if (ranges.veryHeavy?.maxExclusive !== undefined && ranges.veryHeavy.maxExclusive !== null) {
		issues.push({
			path: `${path}.very_heavy.maxExclusive`,
			message: 'The very_heavy range must be open-ended.',
		});
	}
}

function validateCommandBase(input: OrganizationSettingsCommandInput): DomainValidationIssue[] {
	const issues = createIssues();
	requireUuid(input.organizationId, 'organizationId', issues);
	requireUuid(input.actorProfileId, 'actorProfileId', issues);
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

function requireUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const normalized = normalizeOptionalId(value);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return;
	}
	if (!isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
}

function normalizeRequiredId(value: string | null | undefined): string {
	return normalizeOptionalId(value) ?? '';
}

function normalizeOptionalId(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
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

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createIssues(): DomainValidationIssue[] {
	return [];
}

function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}
