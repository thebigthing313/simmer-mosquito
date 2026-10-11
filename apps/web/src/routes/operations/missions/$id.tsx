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
import { ArrowLeftIcon, iconRegistry, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { StopSequenceMap } from '../../../components/map/stop-sequence-map';
import { MissionDetailHeader } from '../../../components/operations/missions/mission-detail-header';
import {
	MissionNotificationCount,
	MissionNotificationsCard,
} from '../../../components/operations/missions/mission-notifications-card';
import { MissionStopList } from '../../../components/operations/missions/mission-stops';
import { RenameStopDialog } from '../../../components/operations/missions/rename-stop-dialog';
import { RequestStopPicker } from '../../../components/operations/missions/request-stop-picker';
import { WorklistTabs } from '../../../components/operations/worklist-tabs';
import { ReasonDialog } from '../../../components/reason-dialog';
import { DetailPageHeaderSkeleton } from '../../../components/record/detail-page-header';
import { type MissionRun, useMissionRun } from '../../../hooks/operations/use-mission-run';
import { type AskAcknowledged, useAcknowledgedWrite } from '../../../hooks/use-acknowledged-write';
import { MISSION_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';

const MissionIcon = iconRegistry.entities.route.icon;
const NotificationsIcon = iconRegistry.actions.send.icon;

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
	// Held here rather than in the panel, and rendered here too. The delete is
	// optimistic, so the mission leaves the collection the moment the button is
	// pressed and the panel unmounts before the registry's refusal comes back.
	// This component survives it: the row going is what makes it render
	// `MissionNotFound` instead.
	const { run: askDelete, dialog } = useAcknowledgedWrite({
		askable: MISSION_DELETE_REFUSALS,
		ask: true,
	});

	if (run.isReady && run.mission === null) {
		return (
			<>
				<MissionNotFound />
				{dialog}
			</>
		);
	}

	return (
		<>
			<MapSplitPage
				map={
					<StopSequenceMap
						features={run.features}
						fitKey={id}
						highlightId={run.highlightId}
						recordType="mission"
						onHoverStop={run.setHighlightId}
						onSelectStop={run.setSelectedStopId}
						selectedId={run.selectedStopId}
						stopCount={run.stops.length}
					/>
				}
			>
				<MissionPanel askDelete={askDelete} missionId={id} run={run} />
			</MapSplitPage>

			<MissionDialogs run={run} />
			{dialog}
		</>
	);
}

/**
 * The rail beside the map: the header, then Stops, Comments and Notifications
 * taking turns under it, so the stop list keeps the rail's full height.
 */
function MissionPanel({
	missionId,
	run,
	askDelete,
}: {
	readonly missionId: string;
	readonly run: MissionRun;
	readonly askDelete: AskAcknowledged;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			{run.mission === null ? (
				<DetailPageHeaderSkeleton frame="panel" />
			) : (
				<MissionDetailHeader askDelete={askDelete} mission={run.mission} run={run} />
			)}

			<WorklistTabs
				extraTab={
					run.mission === null
						? undefined
						: {
								value: 'notifications',
								label: 'Notifications',
								icon: <NotificationsIcon aria-hidden="true" />,
								count: <MissionNotificationCount missionId={missionId} />,
								content: <MissionNotificationsCard missionId={missionId} />,
							}
				}
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
					onRename={run.setRenameTarget}
					onSelect={run.setSelectedStopId}
					planEditable={run.planEditable && !run.busy}
					progressEnabled={run.progressEnabled}
					recordEnabled={run.recordEnabled}
					selectedStopId={run.selectedStopId}
					stops={run.stops}
				/>
			</WorklistTabs>
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
			/>
			{/* The picker covers the queue; this covers everywhere else. */}
			<Button asChild size="sm" variant="ghost">
				<Link params={{ id: missionId }} to="/operations/missions/$id/add-stop">
					<MapPinnedIcon aria-hidden="true" />
					Add a Stop by Map
				</Link>
			</Button>
		</div>
	);
}

/**
 * The five: skip a stop, rename a stop, remove a stop, call the mission off,
 * pick it back up.
 *
 * Three of them collect prose because the answer is written onto the record: a
 * skip reason onto the stop, a cancellation and a reopen onto the mission as
 * comments. Renaming collects the name itself, and is the one that is not a
 * confirmation. Removing a stop takes it off the mission entirely, so there is
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

			{run.renameTarget === null ? null : (
				<RenameStopDialog
					onClose={() => run.setRenameTarget(null)}
					onRename={run.confirmRename}
					stop={run.renameTarget}
				/>
			)}

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
							Back to Missions
						</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	);
}
