import { useBreadcrumbLabel } from '@simmer-mosquito/ui-web/components/app-shell';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useOrganizations } from './-organization-data';

/**
 * The layout every organization drill-down sits under.
 *
 * Its only job is the breadcrumb: without it a deep organization URL renders as
 * "Organizations › #a1b2c3…", because the shell can only title-case what is in
 * the path. Registering the name here means the header reads "Organizations ›
 * Directory › Coastal MAD › Members" on every child page, resolved once rather
 * than per page.
 */
export const Route = createFileRoute('/organizations/$organizationId')({
	component: OrganizationLayoutRoute,
});

function OrganizationLayoutRoute() {
	const { organizationId } = Route.useParams();
	// Reads the directory's cache rather than fetching the organization again —
	// the operator arrived through that list, so it is already warm.
	const { data } = useOrganizations();
	const organization = (data ?? []).find((row) => row.id === organizationId);

	useBreadcrumbLabel(organizationId, organization?.name);

	return <Outlet />;
}
