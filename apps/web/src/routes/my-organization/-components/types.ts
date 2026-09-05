import type { RangeDensity, UnitDefaults } from '@simmer-mosquito/domain';
import type React from 'react';

// Re-exported rather than re-declared: two identical unions under one name are
// what `fallow dead-code` calls a duplicate export, and the ladder's names have
// exactly one home (`packages/domain`).
export type { SimmerRole } from '@simmer-mosquito/domain';
export type OrganizationSectionId =
	| 'general'
	| 'people'
	| 'adult'
	| 'larval'
	| 'control'
	| 'insecticides'
	| 'public'
	| 'keyBindings';

export type ControlMethodCollectionKey =
	| 'applicationMethods'
	| 'sourceReductionMethods'
	| 'biocontrolMethods'
	| 'outreachMethods';
export type ControlAssetCollectionKey = 'vehicles' | 'equipment';
export interface SetupCatalog {
	readonly domain: SetupDomain;
	readonly label: string;
	readonly count: number;
	readonly editable: boolean;
	readonly detail: string;
}

export interface OrganizationDetailsFormValues {
	readonly name: string;
	readonly mainContactEmail: string;
	readonly phoneNumber: string;
	readonly mailingAddressLine1: string;
	readonly mailingAddressLine2: string;
	readonly mailingLocality: string;
	readonly mailingRegion: string;
	readonly mailingPostalCode: string;
	readonly timezone: string;
}

export interface TagFormValues {
	readonly tagName: string;
	readonly description: string;
	readonly color: string;
	readonly isActive: boolean;
}

export interface PublicSettingsFormValues {
	readonly radiusAmount: number | null;
	readonly radiusUnitCode: string;
	readonly daysBefore: number | null;
	readonly daysAfter: number | null;
}

export interface ControlMethodListConfig {
	readonly addLabel: string;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly detail: string;
	readonly fieldLabel: string;
	readonly lowercaseTitle: string;
	readonly placeholder: string;
	readonly singularLabel: string;
	readonly title: string;
}

export interface ControlAssetListConfig {
	readonly addLabel: string;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly detail: string;
	readonly fieldLabel: string;
	readonly lowercaseTitle: string;
	readonly metadataDescription: string;
	readonly placeholder: string;
	readonly singularLabel: string;
	readonly title: string;
}

export type DensityRangeFormValues = Readonly<Record<RangeDensity, DensityRangeFormValue>>;

export interface DensityRangeFormValue {
	readonly minInclusive: string;
	readonly maxExclusive: string;
}

export type UnitDefaultsFormValues = UnitDefaults;

export type SetupDomain =
	| 'adultSurveillance'
	| 'larvalSurveillance'
	| 'controlOperations'
	| 'publicEngagement'
	| 'sharedOperations';

export type SettingField = TextSettingField | SelectSettingField | SwitchSettingField;

export interface TextSettingField {
	readonly kind: 'text';
	readonly label: string;
	readonly value: string;
	readonly editable: boolean;
	readonly inputType?: React.HTMLInputTypeAttribute | undefined;
}

export interface SelectSettingField {
	readonly kind: 'select';
	readonly label: string;
	readonly value: string;
	readonly editable: boolean;
	readonly options: readonly SelectOption[];
}

export interface SwitchSettingField {
	readonly kind: 'switch';
	readonly label: string;
	readonly checked: boolean;
	readonly editable: boolean;
}

export interface SelectOption {
	readonly label: string;
	readonly value: string;
}
