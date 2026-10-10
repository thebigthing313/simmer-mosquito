import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Link } from '@tanstack/react-router';
import {
	type AssignmentListing,
	assignmentDisplayName,
	assignmentStatus,
	type ProgressCounts,
} from '../../../hooks/queries/assignment-view';
import { WriteOnly } from '../../write-only';
import { stopSummary } from '../operations-display';
import { AssignmentStatusBadge } from './assignment-display';

/**
 * The card floated over the Assignments index map for the selected
 * assignment: its name or date, who has it, how far through its stops it is,
 * its status, and Open and Edit links. Takes the assignment, the assignee's
 * name and the stop counts.
 */
export function SelectedAssignmentCard({
	assignment,
	assigneeName,
	counts,
}: {
	readonly assignment: AssignmentListing;
	readonly assigneeName: string | null;
	readonly counts: ProgressCounts;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center sm:justify-start">
			<div className="pointer-events-auto w-full max-w-sm rounded-lg border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 className="truncate font-semibold text-foreground text-sm leading-tight">
							{assignmentDisplayName(assignment)}
						</h2>
						<p className="m-0 text-muted-foreground text-xs">
							{assigneeName ?? 'Unassigned'} · {stopSummary(counts)}
						</p>
					</div>
					<AssignmentStatusBadge status={assignmentStatus(assignment)} />
				</div>
				<div className="mt-3 flex gap-2">
					<Button asChild className="flex-1" size="sm">
						<Link params={{ id: assignment.id }} to="/operations/assignments/$id">
							Open
						</Link>
					</Button>
					<WriteOnly minimum="manager">
						<Button asChild className="flex-1" size="sm" variant="outline">
							<Link params={{ id: assignment.id }} to="/operations/assignments/$id/edit">
								Edit
							</Link>
						</Button>
					</WriteOnly>
				</div>
			</div>
		</div>
	);
}
