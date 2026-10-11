import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { AssignmentListing, ProgressCounts } from '../../../hooks/queries/assignment-view';
import { createLabel } from '../../app-shell/navigation';
import { RESULT_SKELETON_KEYS } from '../../explorer';
import { WriteOnly } from '../../write-only';
import { AssignmentRow } from './assignment-row';

const AssignmentIcon = iconRegistry.entities.vehicle.icon;

/**
 * The Assignments index list: skeleton rows while the window loads, an empty
 * state when nothing is in it, and an `AssignmentRow` per assignment
 * otherwise. The empty state reads `hasFilters`, which is the set filters
 * alone and not the window, because its copy already names the date range.
 * Takes the visible assignments, their stop counts, the profile names, the
 * loading flag, the selected id and the select callback.
 */
export function AssignmentResults({
	assignments,
	countsById,
	hasFilters,
	isLoading,
	nameById,
	onSelect,
	selectedId,
}: {
	readonly assignments: readonly AssignmentListing[];
	readonly countsById: ReadonlyMap<string, ProgressCounts>;
	readonly hasFilters: boolean;
	readonly isLoading: boolean;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
	readonly selectedId: string | null;
}) {
	if (isLoading) {
		return (
			<div className="grid gap-2 p-4">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[72px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (assignments.length === 0) {
		return (
			<div className="p-4">
				<Empty className="min-h-[240px] border border-border/40 bg-muted/30">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<AssignmentIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{hasFilters ? 'No Matching Assignments' : 'No Assignments Yet'}</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? 'No assignment in this date range matches the current filters.'
								: 'Assignments dated in this range will appear here.'}
						</EmptyDescription>
					</EmptyHeader>
					{hasFilters ? null : (
						<EmptyContent>
							<WriteOnly minimum="manager">
								<Button asChild size="sm">
									<Link to="/operations/assignments/create">
										<PlusIcon aria-hidden="true" />
										{createLabel('assignment')}
									</Link>
								</Button>
							</WriteOnly>
						</EmptyContent>
					)}
				</Empty>
			</div>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1" type="auto">
			<ul className="m-0 list-none space-y-2 p-4">
				{assignments.map((assignment) => (
					<AssignmentRow
						assignment={assignment}
						assigneeName={
							assignment.assignedToProfileId === null
								? null
								: (nameById.get(assignment.assignedToProfileId) ?? null)
						}
						counts={countsById.get(assignment.id) ?? null}
						isSelected={assignment.id === selectedId}
						key={assignment.id}
						onSelect={onSelect}
					/>
				))}
			</ul>
		</ScrollArea>
	);
}
