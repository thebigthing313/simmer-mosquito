import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useAssignmentMutations } from '../../../hooks/mutations/use-assignment-mutations';
import {
	formatAssignmentDate,
	formatDueAt,
	type ProgressCounts,
} from '../../../hooks/queries/assignment-view';
import type { AskAcknowledged } from '../../../hooks/use-acknowledged-write';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { DetailPageHeader } from '../../record/detail-page-header';
import { StopProgressSummary } from '../operations-display';
import {
	PendingStopsHint,
	type WorklistPhase,
	worklistLifecycleActions,
} from '../worklist-lifecycle';
import { type AssignmentView, canCompleteAssignment, canStartAssignment } from './assignment-data';
import { AssignmentStatusBadge } from './assignment-display';

const AssignmentIcon = iconRegistry.entities.vehicle.icon;

/** The page's handlers for the four lifecycle commands, each already wrapped in its runner. */
export interface AssignmentLifecycleHandlers {
	readonly busy: boolean;
	readonly onStart: () => void;
	readonly onComplete: () => void;
	/** Opens the cancel reason dialog the page mounts. */
	readonly onCancel: () => void;
	readonly onReopen: () => void;
}

/**
 * The bar the assignment run page opens with, and the lines under it.
 *
 * `DetailPageHeader` in the `panel` frame, with the status badge in its flags,
 * the pencil to the plan edit page at the manager floor, and Start or
 * Complete, Cancel, Reopen and Delete in the `...`. Under the bar: the stop
 * progress, the pending-stops hint and the cancellation reason. It takes the
 * assignment, its display name and assignee, the stop counts, the page's
 * lifecycle handlers and the delete ask the route holds.
 */
export function AssignmentDetailHeader({
	assignment,
	name,
	assigneeName,
	counts,
	lifecycle,
	askDelete,
}: {
	readonly assignment: AssignmentView;
	readonly name: string;
	readonly assigneeName: string | null;
	readonly counts: ProgressCounts;
	readonly lifecycle: AssignmentLifecycleHandlers;
	readonly askDelete: AskAcknowledged;
}) {
	const timeZone = useOrganizationTimeZone();
	const assignmentWrites = useAssignmentMutations();
	const phase = assignmentPhase(assignment.status);
	const due = formatDueAt(assignment.dueAt, timeZone);

	return (
		<>
			<DetailPageHeader
				actions={worklistLifecycleActions({
					...lifecycle,
					canComplete: canCompleteAssignment(assignment.status, counts),
					canStart: canStartAssignment(assignment.status, counts),
					phase,
					recordType: 'assignment',
				})}
				edit={{
					minimum: 'manager',
					params: { id: assignment.id },
					to: '/operations/assignments/$id/edit',
				}}
				flags={<AssignmentStatusBadge status={assignment.status} />}
				frame="panel"
				icon={AssignmentIcon}
				recordType="assignment"
				remove={{
					ask: askDelete,
					name,
					onDelete: (acknowledgements) => assignmentWrites.remove(assignment.id, acknowledgements),
					recordId: assignment.id,
					returnTo: '/operations/assignments',
				}}
				subtitle={
					<p className="m-0">
						{formatAssignmentDate(assignment.assignmentDate)} · {assigneeName ?? 'Unassigned'}
						{due === null ? '' : ` · due ${due}`}
					</p>
				}
				title={name}
			/>
			<div className="grid shrink-0 gap-2 border-border/40 border-b p-4">
				<StopProgressSummary counts={counts} emptyLabel="No stops on this assignment yet." />
				<PendingStopsHint pending={counts.pending} phase={phase} />
				{assignment.status === 'cancelled' && assignment.cancellationReason !== null ? (
					<p className="m-0 text-muted-foreground text-sm">
						Cancelled: {assignment.cancellationReason}
					</p>
				) : null}
			</div>
		</>
	);
}

function assignmentPhase(status: AssignmentView['status']): WorklistPhase {
	switch (status) {
		case 'notStarted':
			return 'notStarted';
		case 'inProgress':
			return 'inProgress';
		case 'completed':
		case 'cancelled':
			return 'ended';
	}
}
