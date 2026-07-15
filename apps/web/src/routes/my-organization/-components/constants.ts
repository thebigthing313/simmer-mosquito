import type { LarvalInspectionEntryMode } from '@simmer-mosquito/domain';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { webCollections } from '../../../sync/webCollections';
import type {
	ControlAssetCollectionKey,
	ControlAssetListConfig,
	ControlMethodCollectionKey,
	ControlMethodListConfig,
	DensityRangeFormValues,
	OrgRole,
} from './types';

export const collections = webCollections;
export const ORG_ROLE_OPTIONS: readonly OrgRole[] = [
	'viewer',
	'collector',
	'manager',
	'admin',
	'owner',
];
export const AddIcon = iconRegistry.actions.add.icon;
export const ArrowRightIcon = iconRegistry.arrows.arrowRight.icon;
export const CloseIcon = iconRegistry.actions.close.icon;
export const DeleteIcon = iconRegistry.actions.delete.icon;
export const EditIcon = iconRegistry.actions.edit.icon;
export const SaveIcon = iconRegistry.actions.save.icon;
export const US_TIMEZONE_OPTIONS = [
	{ label: 'Eastern Time', value: 'America/New_York' },
	{ label: 'Central Time', value: 'America/Chicago' },
	{ label: 'Mountain Time', value: 'America/Denver' },
	{ label: 'Mountain Time (Arizona)', value: 'America/Phoenix' },
	{ label: 'Pacific Time', value: 'America/Los_Angeles' },
	{ label: 'Alaska Time', value: 'America/Anchorage' },
	{ label: 'Hawaii Time', value: 'Pacific/Honolulu' },
] as const;
export const US_STATE_OPTIONS = [
	{ code: 'AL', name: 'Alabama' },
	{ code: 'AK', name: 'Alaska' },
	{ code: 'AZ', name: 'Arizona' },
	{ code: 'AR', name: 'Arkansas' },
	{ code: 'CA', name: 'California' },
	{ code: 'CO', name: 'Colorado' },
	{ code: 'CT', name: 'Connecticut' },
	{ code: 'DE', name: 'Delaware' },
	{ code: 'FL', name: 'Florida' },
	{ code: 'GA', name: 'Georgia' },
	{ code: 'HI', name: 'Hawaii' },
	{ code: 'ID', name: 'Idaho' },
	{ code: 'IL', name: 'Illinois' },
	{ code: 'IN', name: 'Indiana' },
	{ code: 'IA', name: 'Iowa' },
	{ code: 'KS', name: 'Kansas' },
	{ code: 'KY', name: 'Kentucky' },
	{ code: 'LA', name: 'Louisiana' },
	{ code: 'ME', name: 'Maine' },
	{ code: 'MD', name: 'Maryland' },
	{ code: 'MA', name: 'Massachusetts' },
	{ code: 'MI', name: 'Michigan' },
	{ code: 'MN', name: 'Minnesota' },
	{ code: 'MS', name: 'Mississippi' },
	{ code: 'MO', name: 'Missouri' },
	{ code: 'MT', name: 'Montana' },
	{ code: 'NE', name: 'Nebraska' },
	{ code: 'NV', name: 'Nevada' },
	{ code: 'NH', name: 'New Hampshire' },
	{ code: 'NJ', name: 'New Jersey' },
	{ code: 'NM', name: 'New Mexico' },
	{ code: 'NY', name: 'New York' },
	{ code: 'NC', name: 'North Carolina' },
	{ code: 'ND', name: 'North Dakota' },
	{ code: 'OH', name: 'Ohio' },
	{ code: 'OK', name: 'Oklahoma' },
	{ code: 'OR', name: 'Oregon' },
	{ code: 'PA', name: 'Pennsylvania' },
	{ code: 'RI', name: 'Rhode Island' },
	{ code: 'SC', name: 'South Carolina' },
	{ code: 'SD', name: 'South Dakota' },
	{ code: 'TN', name: 'Tennessee' },
	{ code: 'TX', name: 'Texas' },
	{ code: 'UT', name: 'Utah' },
	{ code: 'VT', name: 'Vermont' },
	{ code: 'VA', name: 'Virginia' },
	{ code: 'WA', name: 'Washington' },
	{ code: 'WV', name: 'West Virginia' },
	{ code: 'WI', name: 'Wisconsin' },
	{ code: 'WY', name: 'Wyoming' },
	{ code: 'DC', name: 'District of Columbia' },
] as const;
export const US_STATE_SELECT_OPTIONS = US_STATE_OPTIONS.map((state) => ({
	label: `${state.code} - ${state.name}`,
	value: state.code,
}));
export const larvalEntryModeOptions: readonly {
	readonly label: string;
	readonly value: LarvalInspectionEntryMode;
}[] = [
	{ label: 'Density only', value: 'density_only' },
	{ label: 'Count and dips required', value: 'count_and_dips_required' },
	{ label: 'Hybrid', value: 'hybrid' },
];
export const densityRangeKeys = ['light', 'medium', 'heavy', 'very_heavy'] as const;
export const defaultDensityRangeValues: DensityRangeFormValues = {
	light: { minInclusive: '0', maxExclusive: '1' },
	medium: { minInclusive: '1', maxExclusive: '5' },
	heavy: { minInclusive: '5', maxExclusive: '10' },
	very_heavy: { minInclusive: '10', maxExclusive: '' },
};
export const controlMethodListConfigs: Record<ControlMethodCollectionKey, ControlMethodListConfig> =
	{
		applicationMethods: {
			addLabel: 'Add method',
			collectionKey: 'applicationMethods',
			detail:
				'Chemical application methods can define optional custom fields for treatment records.',
			fieldLabel: 'Application method name',
			lowercaseTitle: 'application methods',
			placeholder: 'e.g. ULV truck spray',
			singularLabel: 'application method',
			title: 'Application methods',
		},
		sourceReductionMethods: {
			addLabel: 'Add method',
			collectionKey: 'sourceReductionMethods',
			detail:
				'Source reduction methods can define optional custom fields for removal or mitigation work.',
			fieldLabel: 'Source reduction method name',
			lowercaseTitle: 'source reduction methods',
			placeholder: 'e.g. Container removal',
			singularLabel: 'source reduction method',
			title: 'Source reduction methods',
		},
		biocontrolMethods: {
			addLabel: 'Add method',
			collectionKey: 'biocontrolMethods',
			detail:
				'Biocontrol methods can define optional custom fields for biological treatment records.',
			fieldLabel: 'Biocontrol method name',
			lowercaseTitle: 'biocontrol methods',
			placeholder: 'e.g. Mosquitofish release',
			singularLabel: 'biocontrol method',
			title: 'Biocontrol methods',
		},
		outreachMethods: {
			addLabel: 'Add method',
			collectionKey: 'outreachMethods',
			detail: 'Outreach methods define how public engagement actions are categorized.',
			fieldLabel: 'Outreach method name',
			lowercaseTitle: 'outreach methods',
			placeholder: 'e.g. Door hanger',
			singularLabel: 'outreach method',
			title: 'Outreach methods',
		},
	};
export const controlAssetListConfigs: Record<ControlAssetCollectionKey, ControlAssetListConfig> = {
	vehicles: {
		addLabel: 'Add vehicle',
		collectionKey: 'vehicles',
		detail:
			'Vehicles are field resources that can carry extra metadata such as plate numbers or assigned zones.',
		fieldLabel: 'Vehicle name',
		lowercaseTitle: 'vehicles',
		metadataDescription: 'Add any vehicle-specific details your team needs to track.',
		placeholder: 'e.g. Truck 7',
		singularLabel: 'vehicle',
		title: 'Vehicles',
	},
	equipment: {
		addLabel: 'Add equipment',
		collectionKey: 'equipment',
		detail: 'Equipment records can include serial numbers and metadata for operational tracking.',
		fieldLabel: 'Equipment name',
		lowercaseTitle: 'equipment',
		metadataDescription:
			'Add equipment-specific details such as calibration notes or storage location.',
		placeholder: 'e.g. Backpack sprayer',
		singularLabel: 'equipment',
		title: 'Equipment',
	},
};

export const insecticideTypeOptions = [
	{ label: 'Larvicide', value: 'larvicide' },
	{ label: 'Adulticide', value: 'adulticide' },
	{ label: 'Pupicide', value: 'pupicide' },
	{ label: 'Other', value: 'other' },
] as const;

export const sections = [
	{ id: 'general', label: 'General', to: '/my-organization' },
	{ id: 'people', label: 'People', to: '/my-organization/people' },
	{ id: 'adult', label: 'Adult Surveillance', to: '/my-organization/adult-surveillance' },
	{ id: 'larval', label: 'Larval Surveillance', to: '/my-organization/larval-surveillance' },
	{ id: 'control', label: 'Control Methods', to: '/my-organization/control-methods' },
	{ id: 'insecticides', label: 'Insecticides', to: '/my-organization/insecticides' },
	{ id: 'public', label: 'Public Engagement', to: '/my-organization/public-engagement' },
] as const;
