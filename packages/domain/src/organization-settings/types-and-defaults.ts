import type { DomainId, DomainValidationIssue } from '../shared.js';

export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';
export type LarvalInspectionEntryMode = 'density_only' | 'count_and_dips_required' | 'hybrid';
export type AdultCollectionTimingMode = 'exact_timestamps' | 'collection_date_duration';

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

/**
 * One key press records one species. Sex and physiological status are not bound to
 * the key — the adult entry modal carries a sticky mode that every press inherits —
 * so an agency needs one key per species rather than one per species/sex/status
 * combination, and the same binding set serves adult and larval identification.
 */
export interface SpeciesKeyBinding {
	readonly key: string;
	readonly speciesId: DomainId;
}

export interface SpeciesKeyBindings {
	readonly bindings: readonly SpeciesKeyBinding[];
}

export interface OrganizationSettings {
	readonly schemaVersion: 1;
	readonly timezone: string;
	readonly unitDefaults: UnitDefaults;
	/**
	 * Top-level because both adult and larval identification read the same set, and
	 * species ids come from the global taxonomy rather than either domain's catalog.
	 */
	readonly speciesKeyBindings: SpeciesKeyBindings;
	readonly adultSurveillance: Readonly<{
		readonly collectionTimingMode: AdultCollectionTimingMode;
	}>;
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
	| 'organizationSettings.updateAdultCollectionTimingMode'
	| 'organizationSettings.updateLarvalInspectionEntryPolicy'
	| 'organizationSettings.updateInsecticideBatchTracking'
	| 'organizationSettings.updateServiceRequestContext'
	| 'organizationSettings.updateSpeciesKeyBindings';

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

export interface UpdateAdultCollectionTimingModeCommandInput
	extends OrganizationSettingsCommandInput {
	readonly collectionTimingMode: AdultCollectionTimingMode;
}

export type UpdateAdultCollectionTimingModeCommand = OrganizationSettingsDomainCommand<
	'organizationSettings.updateAdultCollectionTimingMode',
	OrganizationSettingsCommandPayload & {
		readonly collectionTimingMode: AdultCollectionTimingMode;
	}
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

export interface UpdateSpeciesKeyBindingsCommandInput extends OrganizationSettingsCommandInput {
	readonly speciesKeyBindings: SpeciesKeyBindings;
}

export type UpdateSpeciesKeyBindingsCommand = OrganizationSettingsDomainCommand<
	'organizationSettings.updateSpeciesKeyBindings',
	OrganizationSettingsCommandPayload & { readonly speciesKeyBindings: SpeciesKeyBindings }
>;

export type OrganizationSettingsCommand =
	| UpdateTimezoneCommand
	| UpdateUnitDefaultsCommand
	| UpdateAdultCollectionTimingModeCommand
	| UpdateLarvalInspectionEntryPolicyCommand
	| UpdateInsecticideBatchTrackingCommand
	| UpdateServiceRequestContextCommand
	| UpdateSpeciesKeyBindingsCommand;

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
	speed: 'miles_per_hour',
} as const;

export const DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY: ResolvedLarvalInspectionEntryPolicy = {
	mode: 'hybrid',
	densityRanges: null,
} as const;

export const DEFAULT_ADULT_COLLECTION_TIMING_MODE: AdultCollectionTimingMode = 'exact_timestamps';

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

/** No bindings until an agency sets them up; key entry stays unavailable until then. */
export const DEFAULT_SPECIES_KEY_BINDINGS: SpeciesKeyBindings = {
	bindings: [],
} as const;

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
	schemaVersion: ORGANIZATION_SETTINGS_SCHEMA_VERSION,
	timezone: DEFAULT_ORGANIZATION_TIMEZONE,
	unitDefaults: DEFAULT_UNIT_DEFAULTS,
	speciesKeyBindings: DEFAULT_SPECIES_KEY_BINDINGS,
	adultSurveillance: {
		collectionTimingMode: DEFAULT_ADULT_COLLECTION_TIMING_MODE,
	},
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
