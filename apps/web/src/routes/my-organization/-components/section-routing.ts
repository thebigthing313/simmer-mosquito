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
