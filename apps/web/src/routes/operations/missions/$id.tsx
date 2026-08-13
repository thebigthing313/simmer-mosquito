import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { ReasonDialog } from '../../../components/reason-dialog';
import { WriteOnly } from '../../../components/write-only';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { webCollections } from '../../../sync/webCollections';
import {
	controlTypeLabel,
	formatOperationalDate,
	formatScheduledStart,
	type MissionView,
} from '../-operations-data';
import { MissionStatusBadge, StopProgressSummary, stopSummary } from '../-operations-display';
import { WorklistMap } from '../-worklist-map';
import { WorklistTabs } from '../-worklist-tabs';
import { type MissionRun, useMissionRun } from './-mission-run';
import { MissionStopList, RequestStopPicker } from './-mission-stops';

const MissionIcon = iconRegistry.entities.route.icon;
const EditIcon = iconRegistry.actions.edit.icon;

export const Route = createFileRoute('/operations/missions/$id')({
	component: MissionDetailRoute,
});

/**
 * One mission: its plan, its stops, and working through them.
 *
 * Unlike an assignment, a mission does not split planning onto a second page.
 * A mission's plan *is* its stop list — it carries no geometry of its own and
 * its schedule is set at creation — so the two jobs share one list, with the
 * planning controls gated to managers and the progress controls to whoever the
 * mission belongs to.
 */
function MissionDetailRoute() {
	const { id } = Route.useParams();
	const run = useMissionRun(id);
	useBreadcrumbLabel(id, run.displayName);

	if (run.isReady && run.mission === null) {
		return <MissionNotFound />;
	}

	return (
		<>
			<MapSplitPage
				map={
					<WorklistMap
						features={run.features}
						fitKey={id}
						highlightId={run.highlightId}
						noun="mission"
						onHoverStop={run.setHighlightId}
						onSelectStop={run.setSelectedStopId}
						selectedId={run.selectedStopId}
						stopCount={run.stops.length}
					/>
				}
			>
				<MissionPanel missionId={id} run={run} />
			</MapSplitPage>

			<MissionDialogs run={run} />
		</>
	);
}

/** The rail beside the map: what the mission is, its stops, and how to end it. */
function MissionPanel({
	missionId,
	run,
}: {
	readonly missionId: string;
	readonly run: MissionRun;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
				<Link
					className="inline-flex w-fit items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					to="/operations/missions"
				>
					<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
					Missions
				</Link>

				{run.mission === null ? (
					<div className="grid gap-2">
						<Skeleton className="h-6 w-56" />
						<Skeleton className="h-4 w-40" />
					</div>
				) : (
					<MissionHeader mission={run.mission} run={run} />
				)}

				{run.error === null ? null : (
					<Alert variant="destructive">
						<AlertDescription>{run.error}</AlertDescription>
					</Alert>
				)}
			</div>

			<WorklistTabs
				commentsDescription="Cancellations, reopens, and field notes for this mission."
				stopControls={run.canAddStops ? <AddStopControls missionId={missionId} run={run} /> : null}
				stopCount={run.stops.length}
				target={{ type: 'mission', id: missionId }}
			>
				<MissionStopList
					controlType={run.mission?.controlType ?? null}
					highlightId={run.highlightId}
					isLoading={run.isLoadingStops}
					missionId={missionId}
					onAction={run.itemAction}
					onHover={run.setHighlightId}
					onMove={run.move}
					onRemove={run.setRemoveTarget}
					onSelect={run.setSelectedStopId}
					planEditable={run.planEditable && !run.busy}
					progressEnabled={run.progressEnabled}
					recordEnabled={run.recordEnabled}
					selectedStopId={run.selectedStopId}
					stops={run.stops}
				/>
			</WorklistTabs>

			{run.mission === null ? null : (
				<div className="shrink-0 border-border/40 border-t p-3">
					<DangerZoneCard
						name={run.displayName ?? 'this mission'}
						noun="mission"
						onDelete={() => webCollections.missions.delete(missionId)}
						recordId={missionId}
						recordType="mission"
						returnTo="/operations/missions"
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Adding stops, above the list they land in.
 *
 * These are plan controls rather than page controls, so they sit inside the
 * Stops tab and not in the header — a comment thread has nothing to do with the
 * request queue.
 */
function AddStopControls({
	missionId,
	run,
}: {
	readonly missionId: string;
	readonly run: MissionRun;
}) {
	return (
		<div className="grid shrink-0 gap-2 border-border/40 border-b p-3">
			<RequestStopPicker
				disabled={run.busy}
				existingRequestIds={run.existingRequestIds}
				onAdd={run.addStop}
				organizationId={run.organizationId ?? ''}
			/>
			{/* The picker covers the queue; this covers everywhere else. */}
			<Button asChild size="sm" variant="ghost">
				<Link params={{ id: missionId }} to="/operations/missions/$id/add-stop">
					<MapPinnedIcon aria-hidden="true" />
					Add a stop by map
				</Link>
			</Button>
		</div>
	);
}

/**
 * The four confirmations: skip a stop, remove a stop, call the mission off, pick
 * it back up.
 *
 * Three of them collect prose because the answer is written onto the record — a
 * skip reason onto the stop, a cancellation and a reopen onto the mission as
 * comments. Removing a stop takes it off the mission entirely, so there is
 * nothing left to write a reason on.
 */
function MissionDialogs({ run }: { readonly run: MissionRun }) {
	return (
		<>
			<ReasonDialog
				confirmLabel="Skip Stop"
				description="The stop stays on the mission with its place in the order. Say why it was passed over."
				onConfirm={run.confirmSkip}
				onOpenChange={(open) => !open && run.setSkipTarget(null)}
				open={run.skipTarget !== null}
				placeholder="e.g. Locked gate, dog in the yard, standing water gone."
				required
				title="Skip This Stop?"
			/>

			<ReasonDialog
				confirmLabel="Cancel Mission"
				description="The mission stays on record with whatever was already done. A reason helps whoever reads it later."
				onConfirm={run.confirmCancel}
				onOpenChange={run.setCancelOpen}
				open={run.cancelOpen}
				placeholder="e.g. Called off for wind."
				required={false}
				title="Cancel This Mission?"
			/>

			<ReasonDialog
				confirmLabel="Reopen Mission"
				description="The mission returns to in progress, keeping its stops and everything already recorded on them. Say what brought it back."
				onConfirm={run.confirmReopen}
				onOpenChange={run.setReopenOpen}
				open={run.reopenOpen}
				placeholder="e.g. Weather cleared; finishing the block."
				required={false}
				title="Reopen This Mission?"
			/>

			<AlertDialog
				onOpenChange={(open) => !open && run.setRemoveTarget(null)}
				open={run.removeTarget !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove This Stop?</AlertDialogTitle>
						<AlertDialogDescription>
							The stop comes off the mission and the stops after it move up. The request it came
							from stays open.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep Stop</AlertDialogCancel>
						<AlertDialogAction onClick={run.confirmRemove}>Remove Stop</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/** What the mission is and when it runs, over the controls that move it along. */
function MissionHeader({
	mission,
	run,
}: {
	readonly mission: MissionView;
	readonly run: MissionRun;
}) {
	const timeZone = useOrganizationTimeZone();
	return (
		<>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h1 className="flex items-center gap-2 font-semibold text-foreground text-lg leading-tight">
						<MissionIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
						<span className="min-w-0 truncate">{run.displayName}</span>
					</h1>
					<p className="m-0 mt-0.5 text-muted-foreground text-sm">
						{controlTypeLabel(mission.controlType)}
						{run.methodName === null ? '' : ` · ${run.methodName}`}
						{` · ${formatScheduledStart(mission.scheduledStartAt, timeZone)}`}
					</p>
					<p className="m-0 mt-0.5 text-muted-foreground text-sm">
						{run.assigneeName ?? 'Unassigned'} · {stopSummary(run.counts)}
						{mission.rainDate === null
							? ''
							: ` · rain date ${formatOperationalDate(mission.rainDate)}`}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<MissionStatusBadge status={mission.status} />
					<WriteOnly minimum="manager">
						<Button asChild size="sm" variant="outline">
							<Link params={{ id: mission.id }} to="/operations/missions/$id/edit">
								<EditIcon aria-hidden="true" />
								Edit
							</Link>
						</Button>
					</WriteOnly>
				</div>
			</div>

			<StopProgressSummary counts={run.counts} emptyLabel="No stops on this mission yet." />

			<WriteOnly>
				<MissionLifecycleControls mission={mission} run={run} />
			</WriteOnly>

			{mission.status === 'cancelled' && mission.cancellationReason !== null ? (
				<p className="m-0 text-muted-foreground text-sm">Cancelled: {mission.cancellationReason}</p>
			) : null}
		</>
	);
}

/**
 * The lifecycle controls, one set per state.
 *
 * Start and Complete carry preconditions the server enforces too; they are
 * disabled rather than hidden, because "why can't I finish this?" is a question
 * about the work in front of you, not about your account — and the answer is
 * right there in the counts above.
 */
function MissionLifecycleControls({
	mission,
	run,
}: {
	readonly mission: MissionView;
	readonly run: MissionRun;
}) {
	if (mission.status === 'completed' || mission.status === 'cancelled') {
		return (
			<div className="flex flex-wrap gap-2">
				<WriteOnly minimum="manager">
					<Button disabled={run.busy} onClick={run.reopen} size="sm" variant="outline">
						Reopen
					</Button>
				</WriteOnly>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{mission.status === 'scheduled' ? (
				<Button disabled={run.busy || !run.canStart} onClick={run.start} size="sm">
					Start
				</Button>
			) : (
				<Button disabled={run.busy || !run.canComplete} onClick={run.complete} size="sm">
					Complete
				</Button>
			)}
			<WriteOnly minimum="manager">
				<Button
					disabled={run.busy}
					onClick={() => run.setCancelOpen(true)}
					size="sm"
					variant="outline"
				>
					Cancel
				</Button>
			</WriteOnly>
			{mission.status === 'inProgress' && run.counts.pending > 0 ? (
				<span className="self-center text-muted-foreground text-xs">
					{run.counts.pending === 1
						? '1 stop still pending'
						: `${run.counts.pending} stops still pending`}
				</span>
			) : null}
		</div>
	);
}

function MissionNotFound() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MissionIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Mission Not Found</EmptyTitle>
					<EmptyDescription>
						This mission may have been deleted, or the link is out of date.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button asChild variant="outline">
						<Link to="/operations/missions">
							<ArrowLeftIcon aria-hidden="true" />
							Back to missions
						</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	);
}
