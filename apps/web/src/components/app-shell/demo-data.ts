import type { ShellOrganization, ShellUser } from './types';

/**
 * Standalone sample identity used to exercise the shell in the preview harness.
 * The real app supplies these values from auth + synced collections; nothing in
 * the shell components depends on this file.
 */
export const demoOrganizations: readonly ShellOrganization[] = [
	{ id: 'org-cedar', name: 'Cedar County Mosquito Control', slug: 'cedar' },
	{ id: 'org-river', name: 'River Valley Abatement District', slug: 'river' },
	{ id: 'org-coastal', name: 'Coastal Vector Management', slug: 'coastal' },
];

export const demoUser: ShellUser = {
	name: 'Riley Chen',
	email: 'riley.chen@cedarcounty.gov',
	role: 'Field supervisor',
};
