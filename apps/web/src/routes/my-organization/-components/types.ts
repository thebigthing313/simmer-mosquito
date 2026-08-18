import type { UnitDefaults } from '@simmer-mosquito/domain';
import type {
	CollectionLureRow,
	CollectionMethodRow,
	ControlMethodRow,
	EquipmentRow,
	HabitatTypeRow,
	InsecticideBatchRow,
	InsecticideRow,
	InsecticideType,
	NotificationTypeRow,
	OrganizationRow,
	ProfileRow,
	TagRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import type { JsonSchemaValue, MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import type React from 'react';

// Re-exported rather than re-declared: two identical unions under one name are
// what `fallow dead-code` calls a duplicate export, and the ladder's names have
// exactly one home (`lib/write-access.ts`).
export type { OrgRole } from '../../../lib/write-access';
export type OrganizationSectionId =
	| 'general'
	| 'people'
	| 'adult'
	| 'larval'
	| 'control'
	| 'insecticides'
	| 'public'
	| 'keyBindings';

export type MutableOrganizationRow = {
	-readonly [Key in keyof OrganizationRow]: OrganizationRow[Key];
};

export type MutableProfileRow = {
	-readonly [Key in keyof ProfileRow]: ProfileRow[Key];
};

export type MutableTagRow = {
	-readonly [Key in keyof TagRow]: TagRow[Key];
};

export type DensityRangeKey = 'light' | 'medium' | 'heavy' | 'very_heavy';
export type LarvalDensityDisplayKey = 'none' | DensityRangeKey;
export type ControlMethodCollectionKey =
	| 'applicationMethods'
	| 'sourceReductionMethods'
	| 'biocontrolMethods'
	| 'outreachMethods';
export type ControlAssetCollectionKey = 'vehicles' | 'equipment';
export interface PersistenceTransaction {
	readonly isPersisted: {
		readonly promise: Promise<unknown>;
	};
}

export interface SetupCatalog {
	readonly domain: SetupDomain;
	readonly label: string;
	readonly count: number;
	readonly editable: boolean;
	readonly detail: string;
}

export interface AgencyDetailsFormValues {
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

export interface ProfileFormValues {
	readonly displayName: string;
	readonly isActive: boolean;
}

export interface ControlSettingsFormValues {
	readonly trackInsecticideBatches: boolean;
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

export type DensityRangeFormValues = Readonly<Record<DensityRangeKey, DensityRangeFormValue>>;

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
