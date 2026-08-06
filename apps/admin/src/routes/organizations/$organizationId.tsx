import { useBreadcrumbLabel } from '@simmer-mosquito/ui-web/components/app-shell';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useAgencies } from './-agency-data';

/**
 * The layout every agency drill-down sits under.
 *
 * Its only job is the breadcrumb: without it a deep agency URL renders as
 * "Agencies › #a1b2c3…", because the shell can only title-case what is in the
 * path. Registering the name here means the header reads "Agencies › Directory ›
 * Coastal MAD › Members" on every child page, resolved once rather than per page.
 */
export const Route = createFileRoute('/organizations/$organizationId')({
	component: AgencyLayoutRoute,
});

function AgencyLayoutRoute() {
	const { organizationId } = Route.useParams();
	// Reads the directory's cache rather than fetching the agency again — the
	// operator arrived through that list, so it is already warm.
	const { data } = useAgencies();
	const agency = (data ?? []).find((row) => row.id === organizationId);

	useBreadcrumbLabel(organizationId, agency?.name);

	return <Outlet />;
}
