import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import {
	type AssignmentListing,
	assignmentDisplayName,
	assignmentOwnName,
	assignmentStatus,
	formatAssignmentDate,
	type ProgressCounts,
} from '../../../hooks/queries/assignment-view';
import { useOrganizationClock } from '../../../hooks/use-organization-clock';
import { stopSummary } from '../operations-display';
import { AssignmentStatusBadge } from './assignment-display';

/**
 * One assignment in the Assignments index list: its name or date and status,
 * who has it and when it is due, and how far through its stops it is. The
 * whole card selects the assignment on the map and the chevron opens it.
 * Takes the assignment, the assignee's name, the stop counts, whether it is
 * selected, and the select callback.
 */
export function AssignmentRow({
	assignment,
	assigneeName,
	counts,
	isSelected,
	onSelect,
}: {
	readonly assignment: AssignmentListing;
	readonly assigneeName: string | null;
	readonly counts: ProgressCounts | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const clock = useOrganizationClock();
	const due = clock.formatInstant(assignment.dueAt, 'dueAt');
	const name = assignmentDisplayName(assignment);

	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected ? 'border-primary/60 bg-primary/5' : 'border-border/60 hover:border-border',
			)}
		>
			{/* Full-card target selects on the map; the chevron opens the record. */}
			<button
				aria-label={`Show ${name} on the map`}
				className="absolute inset-0 z-0 cursor-pointer rounded-lg"
				onClick={() => onSelect(assignment.id)}
				type="button"
			/>
			<div className="pointer-events-none relative z-10 flex items-start gap-3 p-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-foreground text-sm">{name}</span>
						<AssignmentStatusBadge status={assignmentStatus(assignment)} />
					</div>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{assignmentOwnName(assignment) === null
							? ''
							: `${formatAssignmentDate(assignment.assignmentDate)} · `}
						{assigneeName ?? 'Unassigned'}
						{due === null ? '' : ` · due ${due}`}
					</p>
					<p className="m-0 mt-1 text-muted-foreground text-xs">{stopSummary(counts)}</p>
				</div>
				<Link
					aria-label="Open assignment"
					className="pointer-events-auto z-20 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					params={{ id: assignment.id }}
					to="/operations/assignments/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}
