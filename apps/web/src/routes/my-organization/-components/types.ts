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
import type React from 'react';
import type { JsonSchemaValue, MetadataValue } from '../../../forms/field-components';

export type OrgRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';
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

export type MutableCollectionMethodRow = {
	-readonly [Key in keyof CollectionMethodRow]: CollectionMethodRow[Key];
};

export type MutableCollectionLureRow = {
	-readonly [Key in keyof CollectionLureRow]: CollectionLureRow[Key];
};

export type MutableHabitatTypeRow = {
	-readonly [Key in keyof HabitatTypeRow]: HabitatTypeRow[Key];
};

export type MutableControlMethodRow = {
	-readonly [Key in keyof ControlMethodRow]: ControlMethodRow[Key];
};

export type MutableVehicleRow = {
	-readonly [Key in keyof VehicleRow]: VehicleRow[Key];
};

export type MutableEquipmentRow = {
	-readonly [Key in keyof EquipmentRow]: EquipmentRow[Key];
};

export type MutableInsecticideRow = {
	-readonly [Key in keyof InsecticideRow]: InsecticideRow[Key];
};

export type MutableInsecticideBatchRow = {
	-readonly [Key in keyof InsecticideBatchRow]: InsecticideBatchRow[Key];
};

export type MutableNotificationTypeRow = {
	-readonly [Key in keyof NotificationTypeRow]: NotificationTypeRow[Key];
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
export type ControlAssetRow = VehicleRow | EquipmentRow;

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

export interface AdultCollectionMethodFormValues {
	readonly name: string;
	readonly description: string;
	readonly actionThreshold: number | null;
	readonly customSchema: JsonSchemaValue;
	readonly isActive: boolean;
}

export interface AdultCollectionLureFormValues {
	readonly name: string;
	readonly description: string;
	readonly isActive: boolean;
}

export interface HabitatTypeFormValues {
	readonly name: string;
	readonly description: string;
	readonly customSchema: JsonSchemaValue;
	readonly isActive: boolean;
}

export interface ControlMethodFormValues {
	readonly name: string;
	readonly customSchema: JsonSchemaValue;
	readonly isActive: boolean;
}

export interface ControlAssetFormValues {
	readonly name: string;
	readonly serialNumber: string;
	readonly metadata: MetadataValue;
	readonly isActive: boolean;
}

export interface InsecticideFormValues {
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly type: InsecticideType;
	readonly registrationNumber: string;
	readonly defaultUnitId: string;
	readonly labelUrl: string;
	readonly msdsUrl: string;
	readonly shorthand: string;
	readonly metadata: MetadataValue;
	readonly isActive: boolean;
}

export interface InsecticideBatchFormValues {
	readonly insecticideId: string;
	readonly batchName: string;
	readonly isActive: boolean;
}

export interface NotificationTypeFormValues {
	readonly name: string;
	readonly description: string;
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
