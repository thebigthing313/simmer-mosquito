import type {
	ShellDomain,
	ShellStandalonePage,
} from '@simmer-mosquito/ui-web/components/app-shell';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';

/**
 * The operator console's domains: the three things a SIMMER operator owns.
 *
 * This is platform-side administration, not agency administration. Agencies are
 * the customers; taxonomy and units are the global reference data every agency
 * reads. Anything an agency owns for itself — its habitats, traps, catalogs, and
 * people-facing settings — belongs in `apps/web` and is deliberately absent.
 *
 * Unlike web's navigation there are no role floors here. Access is all or
 * nothing: the server's operator allowlist admits an account to every `/admin/*`
 * endpoint or to none of them, so there is nothing per-item to filter and no
 * `shellDomainsForRole` equivalent to write.
 *
 * Organization drill-downs (its detail, members, and foundations) are reached
 * from the directory and read as breadcrumbs, the same way web treats a record
 * page. They are destinations, not navigation.
 */
export const adminShellDomains: readonly ShellDomain[] = [
	{
		id: 'organizations',
		label: 'Agencies',
		summary: 'Mosquito control agencies on the platform, and the people in them',
		icon: iconRegistry.entities.organization.icon,
		groups: [
			{
				id: 'organizations-main',
				items: [
					{
						id: 'organizations-directory',
						label: 'Directory',
						to: '/organizations',
						icon: iconRegistry.entities.organization.icon,
					},
					{
						id: 'organizations-create',
						label: 'Create Agency',
						to: '/organizations/create',
						icon: iconRegistry.actions.add.icon,
					},
				],
			},
		],
	},
	{
		id: 'taxonomy',
		label: 'Mosquito Taxonomy',
		summary: 'The global genus and species list every agency identifies against',
		icon: iconRegistry.entities.taxonomy.icon,
		groups: [
			{
				id: 'taxonomy-main',
				items: [
					{
						id: 'taxonomy-genera',
						label: 'Genera',
						to: '/taxonomy/genera',
						icon: iconRegistry.generic.component.icon,
					},
					{
						id: 'taxonomy-species',
						label: 'Species',
						to: '/taxonomy/species',
						icon: iconRegistry.simmer.mosquito.icon,
					},
				],
			},
		],
	},
	{
		id: 'units',
		label: 'Units',
		summary: 'Global units of measure, by quantity and measurement system',
		icon: iconRegistry.entities.unit.icon,
		groups: [
			{
				id: 'units-main',
				items: [
					{
						id: 'units-index',
						label: 'Units',
						to: '/units',
						icon: iconRegistry.entities.unit.icon,
					},
				],
			},
		],
	},
];

/**
 * Destinations outside the domain rail. The console has one: the release
 * history, reached from the version under the brand mark and from no menu.
 */
export const adminStandalonePages: readonly ShellStandalonePage[] = [
	{ path: '/changelog', crumbs: [{ label: "What's New" }] },
];
