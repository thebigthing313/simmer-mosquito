import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { useControlMethodNames } from '../../components/explorer';
import { assignmentStatus } from '../../hooks/queries/assignment-view';
import {
	controlTypeLabel,
	formatRequestedAt,
	formatScheduledStart,
	MISSION_STATUS_LABELS,
	missionDisplayName,
	missionStatus,
	requestDisplayName,
	requestStatus,
} from '../../hooks/queries/operations-view';
import { useAssignmentItemCounts } from '../../hooks/queries/use-assignment-item-counts';
import { useAssignments } from '../../hooks/queries/use-assignments';
import { useMissionItemCounts } from '../../hooks/queries/use-mission-item-counts';
import { useMissions } from '../../hooks/queries/use-missions';
import { useProfileRoster } from '../../hooks/queries/use-profile-roster';
import { useRequestedControlActions } from '../../hooks/queries/use-requested-control-actions';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { addCalendarDays, todayInTimeZone } from '../../lib/local-date';

const OperationsIcon = iconRegistry.entities.vehicle.icon;
const RequestIcon = iconRegistry.domains.controlOperations.icon;
const MissionIcon = iconRegistry.entities.route.icon;
const AssignmentIcon = iconRegistry.entities.vehicle.icon;
const MapIcon = iconRegistry.generic.map.icon;

export const Route = createFileRoute('/operations/')({
	component: OperationsOverviewRoute,
});

// The overview reads the same schedule window the three map pages open on: the
// week just gone plus the fortnight ahead. Requests look further back, because an
// unresolved one from a month ago is still work that has not been done.
const SCHEDULE_DAYS_BACK = 7;
const SCHEDULE_DAYS_AHEAD = 14;
const REQUEST_WINDOW_DAYS = 90;

/** Enough rows to see the shape of the queue without turning a panel into a list page. */
const PANEL_ROW_LIMIT = 8;

function OperationsOverviewRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const scheduleFrom = useMemo(() => addCalendarDays(today, -SCHEDULE_DAYS_BACK), [today]);
	const scheduleTo = useMemo(() => addCalendarDays(today, SCHEDULE_DAYS_AHEAD), [today]);
	const requestFrom = useMemo(() => addCalendarDays(today, -(REQUEST_WINDOW_DAYS - 1)), [today]);

	const profiles = useProfileRoster();
	const profileNameById = useMemo(
		() => new Map(profiles.map((profile) => [profile.id, profile.displayName] as const)),
		[profiles],
	);

	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<header className="grid gap-1.5">
				<div className="flex items-center gap-2 text-muted-foreground">
					<OperationsIcon aria-hidden="true" className="size-4" />
					<span className="font-medium text-xs uppercase tracking-wide">
						Dispatch and crew work
					</span>
				</div>
				<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Operations
				</h1>
				<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
					Control work that has been requested, the worklists crews are running, and the missions
					dispatched against them.
				</p>
			</header>

			<div className="grid gap-5 xl:grid-cols-12">
				<div className="grid content-start gap-5 xl:col-span-6">
					<OpenRequestsPanel from={requestFrom} nameById={profileNameById} to={today} />
				</div>
				<div className="grid content-start gap-5 xl:col-span-6">
					<AssignmentsPanel from={scheduleFrom} nameById={profileNameById} to={scheduleTo} />
					<MissionsPanel from={scheduleFrom} nameById={profileNameById} to={scheduleTo} />
				</div>
			</div>
		</div>
	);
}

/** Header shortcut from a panel to the map page holding the same records. */
function MapLinkButton({
	label,
	to,
}: {
	readonly label: string;
	readonly to: NonNullable<LinkProps['to']>;
}) {
	return (
		<Button asChild className="size-7" size="icon" variant="ghost">
			<Link aria-label={label} title={label} to={to}>
				<MapIcon aria-hidden="true" className="size-4" />
			</Link>
		</Button>
	);
}

function OverviewRow({
	primary,
	secondary,
	trailing,
	icon,
}: {
	readonly primary: string;
	readonly secondary: string;
	readonly trailing: string;
	readonly icon: ReactNode;
}) {
	return (
		<li className="flex items-center gap-3 px-4 py-2.5">
			<span className="shrink-0 text-muted-foreground">{icon}</span>
			<div className="grid min-w-0 flex-1">
				<span className="truncate font-medium text-foreground text-sm">{primary}</span>
				<span className="truncate text-muted-foreground text-xs">{secondary}</span>
			</div>
			<span className="shrink-0 text-right text-muted-foreground text-xs tabular-nums">
				{trailing}
			</span>
		</li>
	);
}

// --- requests ---------------------------------------------------------------

/**
 * Unresolved requests only.
 *
 * A resolved request is finished work and belongs in the map page's history, not
 * on the surface an operator opens to decide what to dispatch next.
 */
function OpenRequestsPanel({
	from,
	to,
	nameById,
}: {
	readonly from: string;
	readonly to: string;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	const { requests, isReady } = useRequestedControlActions(from, to);
	const methodNameById = useControlMethodNames();
	const timeZone = useOrganizationTimeZone();
	const open = useMemo(
		() => requests.filter((request) => requestStatus(request) === 'open'),
		[requests],
	);

	return (
		<Panel
			actions={
				<MapLinkButton label="Open the requests map" to="/operations/requests-for-control" />
			}
			count={isReady ? open.length : undefined}
			icon={<RequestIcon className="size-4" />}
			title="Open Requests for Control"
		>
			{!isReady ? (
				<RowSkeleton count={4} />
			) : open.length === 0 ? (
				<PanelMessage>No control work is waiting to be scheduled.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{open.slice(0, PANEL_ROW_LIMIT).map((request) => (
						<OverviewRow
							icon={<RequestIcon aria-hidden="true" className="size-4" />}
							key={request.id}
							primary={requestDisplayName(request)}
							secondary={`${controlTypeLabel(request.controlType)}${
								request.recommendedMethodId === null
									? ''
									: ` · ${methodNameById.get(request.recommendedMethodId) ?? 'Unknown method'}`
							} · ${
								request.requestedByProfileId === null
									? 'No requester'
									: (nameById.get(request.requestedByProfileId) ?? 'Unknown requester')
							}`}
							trailing={formatRequestedAt(request.requestedAt, timeZone)}
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- assignments ------------------------------------------------------------

function AssignmentsPanel({
	from,
	to,
	nameById,
}: {
	readonly from: string;
	readonly to: string;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	const { assignments, isReady } = useAssignments(from, to);
	const ids = useMemo(() => assignments.map((assignment) => assignment.id), [assignments]);
	const { countsById } = useAssignmentItemCounts(ids);

	// Closed worklists drop out: this panel answers "what is out there now", and a
	// completed assignment from last week is not.
	const active = useMemo(
		() =>
			assignments.filter((assignment) => {
				const status = assignmentStatus(assignment);
				return status === 'notStarted' || status === 'inProgress';
			}),
		[assignments],
	);

	return (
		<Panel
			actions={<MapLinkButton label="Open the assignments map" to="/operations/assignments" />}
			count={isReady ? active.length : undefined}
			icon={<AssignmentIcon className="size-4" />}
			title="Active Assignments"
		>
			{!isReady ? (
				<RowSkeleton count={3} />
			) : active.length === 0 ? (
				<PanelMessage>No assignment is scheduled or running in this window.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{active.slice(0, PANEL_ROW_LIMIT).map((assignment) => {
						const counts = countsById.get(assignment.id) ?? null;
						return (
							<OverviewRow
								icon={<AssignmentIcon aria-hidden="true" className="size-4" />}
								key={assignment.id}
								primary={
									assignment.assignmentName?.trim() || `Assignment ${assignment.assignmentDate}`
								}
								secondary={`${
									assignment.assignedToProfileId === null
										? 'Unassigned'
										: (nameById.get(assignment.assignedToProfileId) ?? 'Unknown')
								} · ${
									counts === null || counts.total === 0
										? 'No stops'
										: `${counts.handled} of ${counts.total} done`
								}`}
								trailing={assignment.assignmentDate}
							/>
						);
					})}
				</ul>
			)}
		</Panel>
	);
}

// --- missions ---------------------------------------------------------------

function MissionsPanel({
	from,
	to,
	nameById,
}: {
	readonly from: string;
	readonly to: string;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	const { missions, isReady } = useMissions(from, to);
	const ids = useMemo(() => missions.map((mission) => mission.id), [missions]);
	const { countsById } = useMissionItemCounts(ids);
	const timeZone = useOrganizationTimeZone();

	const active = useMemo(
		() =>
			missions.filter((mission) => {
				const status = missionStatus(mission);
				return status === 'scheduled' || status === 'inProgress';
			}),
		[missions],
	);

	return (
		<Panel
			actions={<MapLinkButton label="Open the missions map" to="/operations/missions" />}
			count={isReady ? active.length : undefined}
			icon={<MissionIcon className="size-4" />}
			title="Scheduled Missions"
		>
			{!isReady ? (
				<RowSkeleton count={3} />
			) : active.length === 0 ? (
				<PanelMessage>No mission is scheduled or running in this window.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{active.slice(0, PANEL_ROW_LIMIT).map((mission) => {
						const counts = countsById.get(mission.id) ?? null;
						return (
							<OverviewRow
								icon={<MissionIcon aria-hidden="true" className="size-4" />}
								key={mission.id}
								primary={missionDisplayName(mission, timeZone)}
								secondary={`${MISSION_STATUS_LABELS[missionStatus(mission)]} · ${
									mission.assignedToProfileId === null
										? 'Unassigned'
										: (nameById.get(mission.assignedToProfileId) ?? 'Unknown')
								} · ${
									counts === null || counts.total === 0
										? 'No stops'
										: `${counts.handled} of ${counts.total} done`
								}`}
								trailing={formatScheduledStart(mission.scheduledStartAt, timeZone)}
							/>
						);
					})}
				</ul>
			)}
		</Panel>
	);
}
