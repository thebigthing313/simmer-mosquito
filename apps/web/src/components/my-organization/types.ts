import type {
	LarvalInspectionEntryMode,
	OrganizationSettings,
	RangeDensity,
	UnitDefaults,
} from '@simmer-mosquito/domain';
import type React from 'react';
import type { OrganizationSettingsMutations } from '../../hooks/mutations/use-organization-settings-mutations';

// Re-exported rather than re-declared: two identical unions under one name
// are what `fallow dead-code` calls a duplicate export.
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
	/** The record types the Tag is suggested for, as the column spells them. */
	readonly relevantEntityTypes: readonly string[];
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
	readonly fieldLabel: string;
	readonly lowercaseTitle: string;
	readonly placeholder: string;
	readonly singularLabel: string;
	readonly title: string;
}

export interface ControlAssetListConfig {
	readonly addLabel: string;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly fieldLabel: string;
	readonly lowercaseTitle: string;
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

/** A setting the section draws read-only: its label, its value and the options that name it. */
export interface SelectSettingField {
	readonly label: string;
	readonly value: string;
	readonly options: readonly SelectOption[];
}

export interface SelectOption {
	readonly label: string;
	readonly value: string;
}

export interface LarvalSettingsFormValues {
	readonly mode: LarvalInspectionEntryMode;
	readonly densityEnabled: boolean;
	readonly ranges: DensityRangeFormValues;
}

/** The keys of `Values` whose value is a `Field`. */
type SettingsFieldKey<Values, Field> = {
	[Key in keyof Values]: Values[Key] extends Field ? Key : never;
}[keyof Values] &
	string;

/** One input in a settings section's sheet, named by the value it edits. */
export type SettingsSectionField<Values> =
	| {
			readonly kind: 'text';
			readonly key: SettingsFieldKey<Values, string>;
			readonly label: string;
	  }
	| {
			readonly kind: 'number';
			readonly key: SettingsFieldKey<Values, number | null>;
			readonly label: string;
	  }
	| {
			readonly kind: 'select';
			readonly key: SettingsFieldKey<Values, string>;
			readonly label: string;
			readonly options: readonly SelectOption[];
	  }
	| {
			readonly kind: 'switch';
			readonly key: SettingsFieldKey<Values, boolean>;
			readonly label: string;
	  };

/**
 * A settings section, described rather than drawn: the values its sheet opens
 * with, the inputs that edit them, and how they become a write.
 */
export interface SettingsSection<Values, Payload> {
	readonly title: string;
	readonly description?: string | undefined;
	/** The values the sheet opens with. */
	readonly read: (settings: OrganizationSettings) => Values;
	readonly fields: readonly SettingsSectionField<Values>[];
	/** The write's input. Throws, naming the field, on a value it cannot convert. */
	readonly convert: (values: Values) => Payload;
	readonly save: (mutations: OrganizationSettingsMutations, payload: Payload) => Promise<unknown>;
	/** The toast's words when a refused write carries no reason of its own. */
	readonly failureMessage: string;
	/** Drawn under the inputs, from the values as they stand. */
	readonly preview?: ((values: Values) => React.ReactNode) | undefined;
}
