import { sections } from './constants';
import type { OrganizationSectionId } from './types';

/** Resolve which organization section a pathname belongs to (longest match wins). */
export function activeOrganizationSectionForPath(
	pathname: string,
	fallback: OrganizationSectionId,
): OrganizationSectionId {
	const normalizedPath = pathname === '/my-organization/' ? '/my-organization' : pathname;
	const exactMatch = sections.find((item) => normalizedPath === item.to);
	if (exactMatch !== undefined) {
		return exactMatch.id;
	}

	return (
		sections
			.filter((item) => item.id !== 'general')
			.find((item) => normalizedPath.startsWith(`${item.to}/`))?.id ?? fallback
	);
}

/**
 * Header tab strip for the organization workspace: one navigable tab per section,
 * with the active tab derived from the current path. Consumed by the global
 * dual-pane header (`RootLayout`) so settings navigation lives in the app header.
 */
export function organizationHeaderTabs(pathname: string): {
	readonly tabs: readonly { readonly label: string; readonly to: string }[];
	readonly activeTab: string;
} {
	const activeId = activeOrganizationSectionForPath(pathname, 'general');
	const activeSection = sections.find((item) => item.id === activeId) ?? sections[0];

	return {
		tabs: sections.map((item) => ({ label: item.label, to: item.to })),
		activeTab: activeSection.label,
	};
}
