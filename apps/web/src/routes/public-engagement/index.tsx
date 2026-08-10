import type { ControlMethodRow, ProfileRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { OutletSimpleLayout } from '../../components/app-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { webCollections } from '../../sync/webCollections';
import {
	addDaysToDateString,
	formatMonthDay,
	type OrganizationServiceRequests,
	OUTREACH_ACTIVITY_WINDOW_DAYS,
	type RecentOutreachAction,
	type RequestParties,
	SERVICE_REQUEST_FEED_WINDOW_DAYS,
	type ServiceRequestEvent,
	type ServiceRequestEventKind,
	todayInTimeZone,
	useOrganizationServiceRequests,
	useRecentOutreachActions,
	useRequestParties,
	useServiceRequestFeed,
} from './-overview-data';
import {
	contactDisplayName,
	formatAddressLine,
	formatReach,
	serviceRequestTitle,
} from './-public-engagement-display';

export const Route = createFileRoute('/public-engagement/')({
	component: PublicEngagementOverviewRoute,
});

const PublicIcon = iconRegistry.domains.publicEngagement.icon;
const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const OutreachIcon = iconRegistry.entities.outreachAction.icon;
const ActivityIcon = iconRegistry.generic.calendar.icon;
const MapIcon = iconRegistry.generic.map.icon;

/** How many rows each panel previews before handing off to the explorer. */
const PREVIEW_COUNT = 6;
/**
 * The feed previews further than the worklists above it. A week of activity on
 * one busy request can be four rows on its own, and a chronology cut at six says
 * less about the week than it does about the cut — so it shows more and scrolls.
 */
const FEED_PREVIEW_COUNT = 20;

function PublicEngagementOverviewRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	const today = useMemo(() => todayInTimeZone(undefined), []);
	const since = useMemo(
		() => addDaysToDateString(today, -(OUTREACH_ACTIVITY_WINDOW_DAYS - 1)),
		[today],
	);
	const feedSince = useMemo(
		() => addDaysToDateString(today, -(SERVICE_REQUEST_FEED_WINDOW_DAYS - 1)),
		[today],
	);

	const requests = useOrganizationServiceRequests(organizationId);

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

				{/*
				 * `items-start` so a short panel keeps its own height rather than
				 * stretching to match the taller one — an outreach card padded out to
				 * six request rows reads as though its list were cut off.
				 */}
				<div className="grid items-start gap-5 xl:grid-cols-2">
					<OpenServiceRequestsPanel requests={requests} />
					<RecentOutreachPanel since={since} />
				</div>

				{/*
				 * Full width and below: the feed is a chronology across every request,
				 * so it reads down rather than beside, and it is the one panel here
				 * whose length is set by how busy the week was.
				 */}
				<ServiceRequestActivityPanel requests={requests} since={feedSince} />
			</div>
		</OutletSimpleLayout>
	);
}

/** Header shortcut from a panel to the map explorer holding the same records. */
function ExplorerLinkButton({
	label,
	to,
}: {
	readonly label: string;
	readonly to: '/public-engagement/service-requests' | '/public-engagement/outreach';
}) {
	return (
		<Button asChild className="size-7" size="icon" variant="ghost">
			<Link aria-label={label} title={label} to={to}>
				<MapIcon aria-hidden="true" className="size-4" />
			</Link>
		</Button>
	);
}

/**
 * One record's line in a panel: subject, a supporting line, and its date.
 *
 * `icon` is optional because a leading icon only earns its column when it varies
 * down the list. Repeated unchanged against every row — as the open requests
 * panel did, stamping the same request glyph six times under a header already
 * carrying it — it is a vertical rule pretending to be information.
 */
function PanelRow({
	icon,
	primary,
	secondary,
	date,
	to,
	params,
}: {
	readonly icon?: ReactNode;
	readonly primary: string;
	readonly secondary: ReactNode;
	readonly date: string;
	readonly to: '/public-engagement/service-requests/$id' | '/public-engagement/outreach/$id';
	readonly params: { readonly id: string };
}) {
	return (
		<li className="flex items-start gap-3 px-4 py-2.5">
			{icon === undefined ? null : (
				<span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
			)}
			<div className="grid min-w-0 flex-1">
				<Link
					className="truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={params}
					to={to}
				>
					{primary}
				</Link>
				<span className="min-w-0 text-muted-foreground text-xs">{secondary}</span>
			</div>
			<span className="w-14 shrink-0 pt-0.5 text-right text-muted-foreground text-xs tabular-nums">
				{date}
			</span>
		</li>
	);
}

// --- open service requests --------------------------------------------------

/**
 * What is still waiting on the agency, newest first.
 *
 * The panel previews the most recent few and hands the rest to the explorer —
 * an agency in season carries more open requests than a summary can usefully
 * list, and the count in the header is the number that matters at a glance.
 */
function OpenServiceRequestsPanel({
	requests,
}: {
	readonly requests: OrganizationServiceRequests;
}) {
	const preview = useMemo(
		() => requests.openRequests.slice(0, PREVIEW_COUNT),
		[requests.openRequests],
	);
	// Only the previewed rows, so the two subsets stay the size of what is drawn.
	const parties = useRequestParties(preview);

	return (
		<Panel
			actions={
				<ExplorerLinkButton
					label="Open the service requests map"
					to="/public-engagement/service-requests"
				/>
			}
			count={requests.isReady ? requests.openCount : undefined}
			footer={
				requests.openCount > preview.length ? (
					<Link
						className="font-medium text-primary hover:underline"
						to="/public-engagement/service-requests"
					>
						View all {requests.openCount} open requests
					</Link>
				) : undefined
			}
			icon={<RequestIcon className="size-4" />}
			title="Open Service Requests"
		>
			{requests.isError ? (
				<PanelMessage>Service requests are unavailable right now.</PanelMessage>
			) : !requests.isReady ? (
				<RowSkeleton count={3} />
			) : preview.length === 0 ? (
				<PanelMessage>No open service requests.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{preview.map((request) => (
						<PanelRow
							date={formatMonthDay(request.requestDate)}
							key={request.id}
							params={{ id: request.id }}
							primary={serviceRequestTitle(request)}
							secondary={<RequestParty parties={parties} request={request} />}
							to="/public-engagement/service-requests/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

/**
 * Who reported a request and where it is — the two things an operator picks up
 * the phone knowing they need, and the two the row used to leave out in favour of
 * the free-text details.
 *
 * Both are still resolving on the first paint (contacts and addresses are
 * on-demand shapes), so each line holds its own space rather than reflowing the
 * list as names arrive.
 */
function RequestParty({
	request,
	parties,
}: {
	readonly request: ServiceRequestRow;
	readonly parties: RequestParties;
}) {
	const contact = parties.contactById.get(request.contactId);
	const address = parties.addressById.get(request.addressId);

	if (!parties.isReady && contact === undefined && address === undefined) {
		return <Skeleton className="h-3.5 w-40" />;
	}

	return (
		<span className="grid gap-0.5">
			<span className="truncate">
				{contact === undefined ? 'Contact unavailable' : contactDisplayName(contact)}
			</span>
			<span className="truncate">
				{address === undefined ? 'Address unavailable' : formatAddressLine(address)}
			</span>
		</span>
	);
}

// --- service request activity -----------------------------------------------

/** How each kind of event reads and looks in the feed. */
const EVENT_PRESENTATION: Readonly<
	Record<ServiceRequestEventKind, { readonly verb: string; readonly icon: RegistryIcon }>
> = {
	created: { verb: 'opened', icon: iconRegistry.actions.add.icon },
	commented: { verb: 'commented on', icon: iconRegistry.actions.comment.icon },
	closed: { verb: 'closed', icon: iconRegistry.actions.check.icon },
};

/**
 * What has happened to the agency's service requests lately, newest first.
 *
 * Unlike the panels above it this is a chronology rather than a worklist: the
 * same request appears as often as it was touched, and an event is worth a row
 * whether or not the request is still open. The kind icon leads each row because
 * here it is the thing that varies — which is exactly when a repeated glyph
 * stops being decoration and starts being the column you read.
 */
function ServiceRequestActivityPanel({
	requests,
	since,
}: {
	readonly requests: OrganizationServiceRequests;
	readonly since: string;
}) {
	const feed = useServiceRequestFeed(requests.requests, since);
	const profileNameById = useProfileNames();
	const titleById = useMemo(
		() =>
			new Map(
				requests.requests.map((request) => [request.id, serviceRequestTitle(request)] as const),
			),
		[requests.requests],
	);
	const preview = feed.events.slice(0, FEED_PREVIEW_COUNT);
	const isError = requests.isError || feed.isError;
	const isReady = requests.isReady && feed.isReady;

	return (
		<Panel
			actions={
				<ExplorerLinkButton
					label="Open the service requests map"
					to="/public-engagement/service-requests"
				/>
			}
			count={isReady ? feed.events.length : undefined}
			icon={<ActivityIcon className="size-4" />}
			scrollBody
			title={`Service Request Activity · Last ${SERVICE_REQUEST_FEED_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Service request activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={4} />
			) : preview.length === 0 ? (
				<PanelMessage>
					No service request activity in the last {SERVICE_REQUEST_FEED_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{preview.map((event) => (
						<ActivityRow
							actorName={
								event.actorProfileId === null
									? null
									: (profileNameById.get(event.actorProfileId) ?? 'Unknown profile')
							}
							event={event}
							key={event.key}
							requestTitle={titleById.get(event.requestId) ?? 'a service request'}
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

function ActivityRow({
	event,
	requestTitle,
	actorName,
}: {
	readonly event: ServiceRequestEvent;
	readonly requestTitle: string;
	readonly actorName: string | null;
}) {
	const { verb, icon: KindIcon } = EVENT_PRESENTATION[event.kind];

	return (
		<PanelRow
			date={formatMonthDay(event.at.slice(0, 10))}
			icon={<KindIcon aria-hidden="true" className="size-4" />}
			params={{ id: event.requestId }}
			primary={`${actorName ?? 'Someone'} ${verb} ${requestTitle}`}
			secondary={
				event.text === null ? (
					<span className="text-muted-foreground/80">Service request</span>
				) : (
					<span className="line-clamp-2">{event.text}</span>
				)
			}
			to="/public-engagement/service-requests/$id"
		/>
	);
}

// --- recent outreach --------------------------------------------------------

function RecentOutreachPanel({ since }: { readonly since: string }) {
	const { outreachActions, isReady, isError } = useRecentOutreachActions(since);
	const labels = useOutreachLabels();
	const preview = outreachActions.slice(0, PREVIEW_COUNT);

	return (
		<Panel
			actions={
				<ExplorerLinkButton label="Open the outreach map" to="/public-engagement/outreach" />
			}
			count={isReady ? outreachActions.length : undefined}
			footer={
				outreachActions.length > preview.length ? (
					<Link
						className="font-medium text-primary hover:underline"
						to="/public-engagement/outreach"
					>
						View all outreach
					</Link>
				) : undefined
			}
			icon={<OutreachIcon className="size-4" />}
			title={`Recent Outreach Actions · Last ${OUTREACH_ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Outreach activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : preview.length === 0 ? (
				<PanelMessage>
					No outreach recorded in the last {OUTREACH_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{preview.map((action) => (
						<PanelRow
							date={formatMonthDay(action.outreachDate)}
							icon={<OutreachIcon aria-hidden="true" className="size-4" />}
							key={action.id}
							params={{ id: action.id }}
							primary={labels.methodNameById.get(action.outreachMethodId) ?? 'Unknown method'}
							secondary={outreachSecondary(action, labels.profileNameById)}
							to="/public-engagement/outreach/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

/** `24 people reached · Jane Ruiz` — who did it and how far it got. */
function outreachSecondary(
	action: RecentOutreachAction,
	profileNameById: ReadonlyMap<string, string>,
): string {
	const reach = `${formatReach(action.reach)} reached`;
	if (action.technicianProfileId === null) {
		return reach;
	}
	return `${reach} · ${profileNameById.get(action.technicianProfileId) ?? 'Unknown technician'}`;
}

/**
 * Who did it, by profile id. `profiles` syncs eagerly, so this is a local lookup
 * — read through `useLiveQuery` rather than the suspense variant so a panel
 * resolves names without suspending the page.
 */
function useProfileNames(): ReadonlyMap<string, string> {
	const profiles = useLiveQuery((query) => query.from({ profile: webCollections.profiles }), []);

	return useMemo(
		() =>
			new Map(
				((profiles.data ?? []) as readonly ProfileRow[]).map(
					(profile) => [profile.id, profile.displayName] as const,
				),
			),
		[profiles.data],
	);
}

/** Method and personnel names for the outreach rows, both from eager catalogs. */
function useOutreachLabels(): {
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly profileNameById: ReadonlyMap<string, string>;
} {
	const methods = useLiveQuery(
		(query) => query.from({ method: webCollections.outreachMethods }),
		[],
	);
	const profileNameById = useProfileNames();

	return useMemo(
		() => ({
			methodNameById: new Map(
				((methods.data ?? []) as readonly ControlMethodRow[]).map(
					(method) => [method.id, method.name] as const,
				),
			),
			profileNameById,
		}),
		[methods.data, profileNameById],
	);
}
