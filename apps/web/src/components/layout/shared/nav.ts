import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';

export interface NavItem {
	readonly to: string;
	readonly label: string;
	readonly icon: RegistryIcon;
}

export interface NavGroup {
	readonly label: string;
	readonly items: readonly NavItem[];
}

/**
 * Primary navigation model, shared by all three layout designs so the comparison
 * isolates chrome rather than content. Mirrors the live product navigation in
 * `routes/-components.tsx`.
 */
export const navigationGroups: readonly NavGroup[] = [
	{
		label: 'General',
		items: [
			{ to: '/', label: 'Dashboard', icon: iconRegistry.generic.component.icon },
			{ to: '/today', label: "Today's Activities", icon: iconRegistry.simmer.fieldWork.icon },
			{
				to: '/my-organization',
				label: 'My Organization',
				icon: iconRegistry.generic.settings.icon,
			},
		],
	},
	{
		label: 'Larval Surveillance',
		items: [
			{ to: '/habitats', label: 'Habitats', icon: iconRegistry.domains.larvalSurveillance.icon },
			{ to: '/inspections', label: 'Inspections', icon: iconRegistry.entities.inspection.icon },
			{ to: '/samples', label: 'Samples', icon: iconRegistry.entities.sample.icon },
		],
	},
	{
		label: 'Adult Surveillance',
		items: [
			{ to: '/traps', label: 'Traps', icon: iconRegistry.entities.trap.icon },
			{ to: '/collections', label: 'Collections', icon: iconRegistry.entities.collection.icon },
		],
	},
	{
		label: 'Control Actions',
		items: [
			{
				to: '/chemical-control',
				label: 'Chemical Control',
				icon: iconRegistry.entities.application.icon,
			},
			{
				to: '/source-reductions',
				label: 'Source Reductions',
				icon: iconRegistry.entities.sourceReductionAction.icon,
			},
			{ to: '/biocontrol', label: 'Biocontrol', icon: iconRegistry.entities.biocontrolAction.icon },
			{
				to: '/public-outreach',
				label: 'Public Outreach',
				icon: iconRegistry.entities.outreachAction.icon,
			},
		],
	},
	{
		label: 'Public Engagement',
		items: [
			{ to: '/contacts', label: 'Contacts', icon: iconRegistry.entities.organization.icon },
			{
				to: '/service-requests',
				label: 'Service Requests',
				icon: iconRegistry.domains.publicEngagement.icon,
			},
		],
	},
	{
		label: 'GIS Data',
		items: [
			{ to: '/address-book', label: 'Address Book', icon: iconRegistry.actions.searchCheck.icon },
			{ to: '/regions', label: 'Regions', icon: iconRegistry.entities.region.icon },
			{ to: '/routes', label: 'Routes', icon: iconRegistry.entities.route.icon },
		],
	},
	{
		label: 'Operations',
		items: [
			{ to: '/assignments', label: 'Assignments', icon: iconRegistry.entities.vehicle.icon },
			{
				to: '/requests-for-control',
				label: 'Requests for Control',
				icon: iconRegistry.domains.controlOperations.icon,
			},
			{ to: '/missions', label: 'Missions', icon: iconRegistry.entities.route.icon },
		],
	},
];

/** Flat list, useful for the icon rail and quick-switchers. */
export const flatNavigation: readonly NavItem[] = navigationGroups.flatMap((group) => group.items);

/** Static identity used to populate the demo chrome (no auth in the preview). */
export const demoIdentity = {
	profileName: 'Riley Chen',
	role: 'Field Supervisor',
	organizationName: 'Cedar County Mosquito Control',
} as const;
