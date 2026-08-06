import type { ControlMethodRow, ProfileRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { OutletSimpleLayout } from '../../components/app-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { webCollections } from '../../sync/webCollections';
import {
	addDaysToDateString,
	formatMonthDay,
	OUTREACH_ACTIVITY_WINDOW_DAYS,
	type RecentOutreachAction,
	todayInTimeZone,
	useOpenServiceRequests,
	useRecentOutreachActions,
} from './-overview-data';
import { formatReach, serviceRequestTitle } from './-public-engagement-display';

export const Route = createFileRoute('/public-engagement/')({
	component: PublicEngagementOverviewRoute,
});

const PublicIcon = iconRegistry.domains.publicEngagement.icon;
const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const OutreachIcon = iconRegistry.entities.outreachAction.icon;
const MapIcon = iconRegistry.generic.map.icon;

/** How many rows each panel previews before handing off to the explorer. */
const PREVIEW_COUNT = 6;

function PublicEngagementOverviewRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	const today = useMemo(() => todayInTimeZone(undefined), []);
	const since = useMemo(
		() => addDaysToDateString(today, -(OUTREACH_ACTIVITY_WINDOW_DAYS - 1)),
		[today],
	);

	const requests = useOpenServiceRequests(organizationId);

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

/** One record's line in a panel: subject, a supporting line, and its date. */
function PanelRow({
	icon,
	primary,
	secondary,
	date,
	to,
	params,
}: {
	readonly icon: ReactNode;
	readonly primary: string;
	readonly secondary: string;
	readonly date: string;
	readonly to: '/public-engagement/service-requests/$id' | '/public-engagement/outreach/$id';
	readonly params: { readonly id: string };
}) {
	return (
		<li className="flex items-center gap-3 px-4 py-2.5">
			<span className="shrink-0 text-muted-foreground">{icon}</span>
			<div className="grid min-w-0 flex-1">
				<Link
					className="truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={params}
					to={to}
				>
					{primary}
				</Link>
				<span className="truncate text-muted-foreground text-xs">{secondary}</span>
			</div>
			<span className="w-14 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
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
	readonly requests: {
		readonly openRequests: readonly ServiceRequestRow[];
		readonly openCount: number;
		readonly isReady: boolean;
		readonly isError: boolean;
	};
}) {
	const preview = requests.openRequests.slice(0, PREVIEW_COUNT);

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
							icon={<RequestIcon aria-hidden="true" className="size-4" />}
							key={request.id}
							params={{ id: request.id }}
							primary={serviceRequestTitle(request)}
							secondary={request.details.trim() || 'No details recorded'}
							to="/public-engagement/service-requests/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
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
 * Method and personnel names for the outreach rows. Both catalogs sync eagerly,
 * so this is a local lookup — read through `useLiveQuery` rather than the
 * suspense variant so the panel resolves names without suspending the page.
 */
function useOutreachLabels(): {
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly profileNameById: ReadonlyMap<string, string>;
} {
	const methods = useLiveQuery(
		(query) => query.from({ method: webCollections.outreachMethods }),
		[],
	);
	const profiles = useLiveQuery((query) => query.from({ profile: webCollections.profiles }), []);

	return useMemo(
		() => ({
			methodNameById: new Map(
				((methods.data ?? []) as readonly ControlMethodRow[]).map(
					(method) => [method.id, method.name] as const,
				),
			),
			profileNameById: new Map(
				((profiles.data ?? []) as readonly ProfileRow[]).map(
					(profile) => [profile.id, profile.displayName] as const,
				),
			),
		}),
		[methods.data, profiles.data],
	);
}
