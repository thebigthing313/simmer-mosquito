import type { ServiceRequestRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../components/app-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { webCollections } from '../../sync/webCollections';
import { isServiceRequestOpen } from './-public-engagement-display';

export const Route = createFileRoute('/public-engagement/')({
	component: PublicEngagementOverviewRoute,
});

const PublicIcon = iconRegistry.domains.publicEngagement.icon;
const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const ContactIcon = iconRegistry.entities.organization.icon;
const OutreachIcon = iconRegistry.entities.outreachAction.icon;
const overviewGcTimeMs = 30_000;

function PublicEngagementOverviewRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	const result = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.organizationId, organizationId)),
		},
		[organizationId],
	);
	const requests = (result.data ?? []) as readonly ServiceRequestRow[];
	const openCount = result.isReady
		? requests.filter((request) => isServiceRequestOpen(request)).length
		: null;

	return (
		<OutletSimpleLayout>
			<div className="grid gap-6">
				<header className="grid gap-1.5">
					<div className="flex items-center gap-2 text-muted-foreground">
						<PublicIcon aria-hidden="true" className="size-4" />
						<span className="font-medium text-xs uppercase tracking-wide">
							Community engagement
						</span>
					</div>
					<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
						Public Engagement
					</h1>
					<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
						Service requests reported by the public, the outreach your crews do, and the contacts
						behind both.
					</p>
				</header>

				<div className="grid gap-5 md:grid-cols-2">
					<OverviewCard
						actionLabel="New Request"
						actionTo="/public-engagement/service-requests/create"
						description="Public reports mapped to where they came from, tracked from open to closed."
						exploreLabel="Open Explorer"
						exploreTo="/public-engagement/service-requests"
						icon={<RequestIcon aria-hidden="true" className="size-5 text-primary" />}
						stat={openCount === null ? null : { label: 'open', value: openCount }}
						title="Service Requests"
					/>
					<OverviewCard
						actionLabel="Record Outreach"
						actionTo="/public-engagement/outreach/create"
						description="Door hangers, site visits, presentations, and mailers, mapped to where they landed."
						exploreLabel="Open Explorer"
						exploreTo="/public-engagement/outreach"
						icon={<OutreachIcon aria-hidden="true" className="size-5 text-primary" />}
						stat={null}
						title="Outreach Actions"
					/>
					<OverviewCard
						actionLabel="New Contact"
						actionTo="/public-engagement/contacts/create"
						description="Residents, organizations, and the trusted messengers your program works through."
						exploreLabel="Open Explorer"
						exploreTo="/public-engagement/contacts"
						icon={<ContactIcon aria-hidden="true" className="size-5 text-primary" />}
						stat={null}
						title="Contacts"
					/>
				</div>
			</div>
		</OutletSimpleLayout>
	);
}

function OverviewCard({
	icon,
	title,
	description,
	stat,
	exploreTo,
	exploreLabel,
	actionTo,
	actionLabel,
}: {
	readonly icon: React.ReactNode;
	readonly title: string;
	readonly description: string;
	readonly stat: { readonly label: string; readonly value: number } | null;
	readonly exploreTo:
		| '/public-engagement/service-requests'
		| '/public-engagement/outreach'
		| '/public-engagement/contacts';
	readonly exploreLabel: string;
	readonly actionTo:
		| '/public-engagement/service-requests/create'
		| '/public-engagement/outreach/create'
		| '/public-engagement/contacts/create';
	readonly actionLabel: string;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-5 py-5">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1.5">
						<span className="flex size-9 items-center justify-center rounded-md bg-primary/10">
							{icon}
						</span>
						<CardTitle>{title}</CardTitle>
						<CardDescription>{description}</CardDescription>
					</div>
					{stat === null ? null : (
						<div className="grid justify-items-end">
							<span className="font-semibold text-2xl text-foreground tabular-nums leading-none">
								{stat.value}
							</span>
							<span className="text-muted-foreground text-xs">{stat.label}</span>
						</div>
					)}
				</div>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2" padding="compact">
				<Button asChild size="sm" variant="outline">
					<Link to={exploreTo}>{exploreLabel}</Link>
				</Button>
				<Button asChild size="sm">
					<Link to={actionTo}>
						<PlusIcon aria-hidden="true" data-icon="inline-start" />
						{actionLabel}
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
