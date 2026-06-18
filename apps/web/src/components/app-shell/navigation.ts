import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { ShellCrumb, ShellDomain, ShellNavItem } from './types';

/**
 * The product's operational domains, expressed fresh from the SIMMER domain
 * vocabulary. Each domain is one icon in the primary rail; its groups populate
 * the secondary sidebar. Paths point at the live route table.
 */
export const shellDomains: readonly ShellDomain[] = [
	{
		id: 'overview',
		label: 'Overview',
		summary: 'Where work stands today',
		icon: iconRegistry.generic.component.icon,
		groups: [
			{
				id: 'overview-main',
				items: [
					{ id: 'today', label: 'Today', to: '/today', icon: iconRegistry.simmer.fieldWork.icon },
					{
						id: 'dashboard',
						label: 'Dashboard',
						to: '/',
						icon: iconRegistry.generic.component.icon,
					},
				],
			},
		],
	},
	{
		id: 'larval',
		label: 'Larval surveillance',
		summary: 'Habitats, inspections, and samples',
		icon: iconRegistry.domains.larvalSurveillance.icon,
		groups: [
			{
				id: 'larval-main',
				items: [
					{
						id: 'habitats',
						label: 'Habitats',
						to: '/habitats',
						icon: iconRegistry.domains.larvalSurveillance.icon,
					},
					{
						id: 'inspections',
						label: 'Inspections',
						to: '/inspections',
						icon: iconRegistry.entities.inspection.icon,
					},
					{
						id: 'samples',
						label: 'Samples',
						to: '/samples',
						icon: iconRegistry.entities.sample.icon,
					},
				],
			},
		],
	},
	{
		id: 'adult',
		label: 'Adult surveillance',
		summary: 'Traps and collections',
		icon: iconRegistry.domains.adultSurveillance.icon,
		groups: [
			{
				id: 'adult-main',
				items: [
					{ id: 'traps', label: 'Traps', to: '/traps', icon: iconRegistry.entities.trap.icon },
					{
						id: 'collections',
						label: 'Collections',
						to: '/collections',
						icon: iconRegistry.entities.collection.icon,
					},
				],
			},
		],
	},
	{
		id: 'control',
		label: 'Control operations',
		summary: 'Field treatment and outreach',
		icon: iconRegistry.domains.controlOperations.icon,
		groups: [
			{
				id: 'control-treatment',
				label: 'Treatment',
				items: [
					{
						id: 'chemical',
						label: 'Chemical control',
						to: '/chemical-control',
						icon: iconRegistry.entities.application.icon,
					},
					{
						id: 'source-reduction',
						label: 'Source reduction',
						to: '/source-reductions',
						icon: iconRegistry.entities.sourceReductionAction.icon,
					},
					{
						id: 'biocontrol',
						label: 'Biocontrol',
						to: '/biocontrol',
						icon: iconRegistry.entities.biocontrolAction.icon,
					},
				],
			},
			{
				id: 'control-engagement',
				label: 'Engagement',
				items: [
					{
						id: 'outreach',
						label: 'Outreach',
						to: '/public-outreach',
						icon: iconRegistry.entities.outreachAction.icon,
					},
				],
			},
		],
	},
	{
		id: 'public',
		label: 'Public engagement',
		summary: 'Requests from the public',
		icon: iconRegistry.domains.publicEngagement.icon,
		groups: [
			{
				id: 'public-main',
				items: [
					{
						id: 'service-requests',
						label: 'Service requests',
						to: '/service-requests',
						icon: iconRegistry.domains.publicEngagement.icon,
					},
					{
						id: 'contacts',
						label: 'Contacts',
						to: '/contacts',
						icon: iconRegistry.entities.organization.icon,
					},
				],
			},
		],
	},
	{
		id: 'gis',
		label: 'GIS',
		summary: 'Spatial reference data',
		icon: iconRegistry.domains.gis.icon,
		groups: [
			{
				id: 'gis-main',
				items: [
					{
						id: 'regions',
						label: 'Regions',
						to: '/regions',
						icon: iconRegistry.entities.region.icon,
					},
					{ id: 'routes', label: 'Routes', to: '/routes', icon: iconRegistry.entities.route.icon },
					{
						id: 'addresses',
						label: 'Address book',
						to: '/address-book',
						icon: iconRegistry.actions.searchCheck.icon,
					},
				],
			},
		],
	},
	{
		id: 'operations',
		label: 'Operations',
		summary: 'Dispatch and field crews',
		icon: iconRegistry.entities.vehicle.icon,
		groups: [
			{
				id: 'operations-main',
				items: [
					{
						id: 'missions',
						label: 'Missions',
						to: '/missions',
						icon: iconRegistry.entities.route.icon,
					},
					{
						id: 'assignments',
						label: 'Assignments',
						to: '/assignments',
						icon: iconRegistry.entities.vehicle.icon,
					},
					{
						id: 'requests-for-control',
						label: 'Requests for control',
						to: '/requests-for-control',
						icon: iconRegistry.domains.controlOperations.icon,
					},
				],
			},
		],
	},
	{
		id: 'organization',
		label: 'Organization',
		summary: 'Agency configuration',
		icon: iconRegistry.generic.settings.icon,
		groups: [
			{
				id: 'organization-main',
				items: [
					{
						id: 'org-general',
						label: 'General',
						to: '/my-organization',
						icon: iconRegistry.generic.settings.icon,
					},
					{
						id: 'org-people',
						label: 'People',
						to: '/my-organization/people',
						icon: iconRegistry.entities.organization.icon,
					},
				],
			},
			{
				id: 'organization-surveillance',
				label: 'Surveillance',
				items: [
					{
						id: 'org-adult',
						label: 'Adult surveillance',
						to: '/my-organization/adult-surveillance',
						icon: iconRegistry.domains.adultSurveillance.icon,
					},
					{
						id: 'org-larval',
						label: 'Larval surveillance',
						to: '/my-organization/larval-surveillance',
						icon: iconRegistry.domains.larvalSurveillance.icon,
					},
				],
			},
			{
				id: 'organization-control',
				label: 'Control',
				items: [
					{
						id: 'org-control-methods',
						label: 'Control methods',
						to: '/my-organization/control-methods',
						icon: iconRegistry.domains.controlOperations.icon,
					},
					{
						id: 'org-insecticides',
						label: 'Insecticides',
						to: '/my-organization/insecticides',
						icon: iconRegistry.entities.insecticide.icon,
					},
					{
						id: 'org-public',
						label: 'Public engagement',
						to: '/my-organization/public-engagement',
						icon: iconRegistry.domains.publicEngagement.icon,
					},
				],
			},
		],
	},
];

/** Longest-prefix active match, so nested record paths still light their item. */
function pathMatches(activePath: string, target: string): boolean {
	if (target === '/') {
		return activePath === '/';
	}

	return activePath === target || activePath.startsWith(`${target}/`);
}

/** Flat list of every item across all domains, paired with its owning domain. */
const flatItems: readonly { readonly domain: ShellDomain; readonly item: ShellNavItem }[] =
	shellDomains.flatMap((domain) =>
		domain.groups.flatMap((group) => group.items.map((item) => ({ domain, item }))),
	);

/** Resolve the active domain + item for a path, falling back to the first domain. */
export function resolveActive(activePath: string): {
	readonly domain: ShellDomain;
	readonly item: ShellNavItem | null;
} {
	let best: { readonly domain: ShellDomain; readonly item: ShellNavItem } | null = null;
	let bestLength = -1;

	for (const candidate of flatItems) {
		if (pathMatches(activePath, candidate.item.to) && candidate.item.to.length > bestLength) {
			best = candidate;
			bestLength = candidate.item.to.length;
		}
	}

	if (best !== null) {
		return best;
	}

	const [first] = shellDomains;
	if (first === undefined) {
		throw new Error('shellDomains must not be empty.');
	}

	return { domain: first, item: null };
}

/** The first navigable destination of a domain (used when its icon is clicked). */
export function firstDestination(domain: ShellDomain): string | null {
	for (const group of domain.groups) {
		const [item] = group.items;
		if (item !== undefined) {
			return item.to;
		}
	}

	return null;
}

function titleCase(segment: string): string {
	return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function looksLikeRecordId(segment: string): boolean {
	return /\d/.test(segment) || /^[0-9a-f]{8,}$/i.test(segment);
}

/**
 * Breadcrumb trail for a path: the active domain, the active item, and any
 * meaningful trailing segments (record ids are skipped as labels).
 */
export function buildBreadcrumbs(activePath: string): readonly ShellCrumb[] {
	const { domain, item } = resolveActive(activePath);
	const crumbs: ShellCrumb[] = [{ label: domain.label }];

	if (item === null) {
		return crumbs;
	}

	crumbs.push({ label: item.label, to: item.to });

	const itemSegments = item.to.split('/').filter(Boolean);
	const pathSegments = activePath.split('/').filter(Boolean);
	const trailing = pathSegments.slice(itemSegments.length);
	for (const segment of trailing) {
		crumbs.push({ label: looksLikeRecordId(segment) ? `#${segment}` : titleCase(segment) });
	}

	return crumbs;
}
