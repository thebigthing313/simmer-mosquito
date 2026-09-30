import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useMissionMutations } from '../../../hooks/mutations/use-mission-mutations';
import type { MissionRun } from '../../../hooks/operations/use-mission-run';
import {
	controlTypeLabel,
	formatScheduledStart,
	missionDisplayName,
} from '../../../hooks/queries/operations-view';
import type { MissionRecord } from '../../../hooks/queries/use-mission';
import type { AskAcknowledged } from '../../../hooks/use-acknowledged-write';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { DetailPageHeader } from '../../record/detail-page-header';
import { formatOperationalDate } from '../operations-data';
import { MissionStatusBadge, StopProgressSummary, stopSummary } from '../operations-display';
import {
	PendingStopsHint,
	type WorklistPhase,
	worklistLifecycleActions,
} from '../worklist-lifecycle';

const MissionIcon = iconRegistry.entities.route.icon;

/**
 * The bar the mission page opens with, and the lines under it.
 *
 * `DetailPageHeader` in the `panel` frame, with the status badge in its flags,
 * the pencil to the edit page at the manager floor, and Start or Complete,
 * Cancel, Reopen and Delete in the `...`. Under the bar: the stop progress,
 * the pending-stops hint and the cancellation reason. Cancel and Reopen open
 * the reason dialogs the page mounts beside the map, through `run`.
 */
export function MissionDetailHeader({
	mission,
	run,
	askDelete,
}: {
	readonly mission: MissionRecord;
	readonly run: MissionRun;
	readonly askDelete: AskAcknowledged;
}) {
	const timeZone = useOrganizationTimeZone();
	const missionWrites = useMissionMutations();
	const phase = missionPhase(mission.status);
	const name = missionDisplayName(mission, timeZone);

	return (
		<>
			<DetailPageHeader
				actions={worklistLifecycleActions({
					busy: run.busy,
					canComplete: run.canComplete,
					canStart: run.canStart,
					onCancel: () => run.setCancelOpen(true),
					onComplete: run.complete,
					onReopen: run.reopen,
					onStart: run.start,
					phase,
					recordType: 'mission',
				})}
				edit={{
					minimum: 'manager',
					params: { id: mission.id },
					to: '/operations/missions/$id/edit',
				}}
				flags={<MissionStatusBadge status={mission.status} />}
				frame="panel"
				icon={MissionIcon}
				recordType="mission"
				remove={{
					ask: askDelete,
					name,
					onDelete: (acknowledgements) => missionWrites.remove(mission.id, acknowledgements),
					recordId: mission.id,
					returnTo: '/operations/missions',
				}}
				subtitle={
					<>
						<p className="m-0">
							{controlTypeLabel(mission.controlType)}
							{run.methodName === null ? '' : ` · ${run.methodName}`}
							{` · ${formatScheduledStart(mission.scheduledStartAt, timeZone)}`}
						</p>
						<p className="m-0">
							{run.assigneeName ?? 'Unassigned'} · {stopSummary(run.counts)}
							{mission.rainDate === null
								? ''
								: ` · rain date ${formatOperationalDate(mission.rainDate)}`}
						</p>
					</>
				}
				title={name}
			/>
			<div className="grid shrink-0 gap-2 border-border/40 border-b p-4">
				<StopProgressSummary counts={run.counts} emptyLabel="No stops on this mission yet." />
				<PendingStopsHint pending={run.counts.pending} phase={phase} />
				{mission.status === 'cancelled' && mission.cancellationReason !== null ? (
					<p className="m-0 text-muted-foreground text-sm">
						Cancelled: {mission.cancellationReason}
					</p>
				) : null}
			</div>
		</>
	);
}

function missionPhase(status: MissionRecord['status']): WorklistPhase {
	switch (status) {
		case 'scheduled':
			return 'notStarted';
		case 'inProgress':
			return 'inProgress';
		case 'completed':
		case 'cancelled':
			return 'ended';
	}
}
