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
import { DropdownMenuItem } from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { ArrowLeftIcon, ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { EditFormSkeleton, RecordEditFrame } from '../../../components/record';
import {
	InlineEditField,
	type MoveAction,
	type MovePlan,
	OrdinalBadge,
	StopList,
	StopReorderControls,
} from '../../../components/stop-order';
import type { RouteStopFeature } from '../../../hooks/map/use-route-layer';
import { useAssignmentItemMutations } from '../../../hooks/mutations/use-assignment-item-mutations';
import { useAssignmentMutations } from '../../../hooks/mutations/use-assignment-mutations';
import { useAssigneeOptions } from '../../../hooks/operations/use-assignee-options';
import { useAssignment } from '../../../hooks/operations/use-assignment';
import { useAssignmentStops } from '../../../hooks/operations/use-assignment-stops';
import { assignmentDisplayName } from '../../../hooks/queries/assignment-view';
import { useStopOrder } from '../../../hooks/stop-order/use-stop-order';
import { useAcknowledgedWrite } from '../../../hooks/use-acknowledged-write';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { ASSIGNMENT_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { errorMessageForSave } from '../../../lib/save-error';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';
import { WorklistMap } from '../-worklist-map';
import { type AssignmentStopView, assignmentStopTone, canEditPlan } from './-assignment-data';
import {
	AssignmentStatusBadge,
	ItemProgressBadge,
	TargetLink,
	TargetTypePill,
} from './-assignment-display';
import {
	AssignmentDetailFields,
	type AssignmentDetailValues,
	assigneeOrNull,
	assignmentNameOrNull,
	deadlineHalfEntered,
	sameAssignmentDetails,
	toAssignmentDetails,
	toDueAt,
} from './-assignment-form';
import {
	AssignmentTargetPicker,
	type AssignmentTargetSelection,
} from './-assignment-target-picker';

/** Module-level so the ordering hook's identity stays stable across renders. */
const stopKey = (stop: AssignmentStopView) => stop.assignmentItemId;

export const Route = createFileRoute('/operations/assignments/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/operations/assignments/$id/edit')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/operations/assignments/$id',
			});
		}
	},
	component: AssignmentPlanRoute,
});

/**
 * Planning a worklist: what it is, which stops it has, and in what order.
 *
 * Progress lives on the run page. Nothing here completes or skips a stop, and
 * no control on this page writes a lifecycle timestamp — the two PATCH command
 * families are built from one body, so a plan edit that touched `completedAt`
 * would read as a lifecycle transition.
 */
function AssignmentPlanRoute() {
	const { id } = Route.useParams();
	const auth = useAuthSnapshot();
	const timeZone = useOrganizationTimeZone();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;

	const {
		updateDetails,
		remove: removeAssignment,
		moveStops,
		canWrite: canWriteAssignment,
	} = useAssignmentMutations();
	// Held on the route itself, and rendered on both of its branches. The delete
	// is optimistic, so the assignment leaves the collection the moment the button
	// is pressed and the card unmounts before the registry's refusal comes back.
	const { run: askDelete, dialog: acknowledgementDialog } = useAcknowledgedWrite({
		askable: ASSIGNMENT_DELETE_REFUSALS,
		ask: true,
	});
	const items = useAssignmentItemMutations();
	// No single submit: the details save, the stop picker, the reorder controls
	// and the directions each write on their own, so `editable` below carries
	// this to every one of them. Both hooks publish `canAttributeWrite` over the
	// snapshot, and both are read because the page writes through both (#944).
	const canSubmit = canWriteAssignment && items.canWrite;

	const { assignment, isReady, isError } = useAssignment(id);
	const { stops, isLoading } = useAssignmentStops(id);
	const { options: assigneeOptions, nameById } = useAssigneeOptions();

	const [detailDraft, setDetailDraft] = useState<AssignmentDetailValues | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [removeTarget, setRemoveTarget] = useState<AssignmentStopView | null>(null);
	const [savingDetails, setSavingDetails] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const assigneeName =
		assignment?.assignedToProfileId == null
			? null
			: (nameById.get(assignment.assignedToProfileId) ?? null);
	const displayName = assignment === null ? null : assignmentDisplayName(assignment, assigneeName);
	useBreadcrumbLabel(id, displayName);

	const savedDetails = assignment === null ? null : toAssignmentDetails(assignment, timeZone);
	const values = detailDraft ?? savedDetails;
	const isDirty =
		detailDraft !== null &&
		savedDetails !== null &&
		!sameAssignmentDetails(detailDraft, savedDetails);

	const commitMove = (plan: MovePlan) => moveStops(id, plan);
	const { ordered: orderedStops, move: moveStop } = useStopOrder({
		items: stops,
		keyOf: stopKey,
		commit: commitMove,
	});

	// Ordinals come off the *pending* order, not the synced one, so a reorder
	// renumbers the pins on the same frame the list rearranges.
	const features: RouteStopFeature[] = orderedStops
		.map((stop, index) => ({ stop, ordinal: index + 1 }))
		.filter((entry) => entry.stop.hasLocation)
		.map((entry) => ({
			id: entry.stop.assignmentItemId,
			lng: entry.stop.target?.lng as number,
			lat: entry.stop.target?.lat as number,
			ordinal: entry.ordinal,
			tone: assignmentStopTone(entry.stop),
		}));

	const existingKeys = new Set(
		stops
			.filter((stop) => stop.entityType !== null)
			.map((stop) => `${stop.entityType}:${stop.entityId}`),
	);

	// Two questions with two answers on screen. `planOpen` is the assignment's
	// lifecycle, and the alert below says so when it is closed; `editable` adds
	// whether this session can attribute a write, which the alert must not read,
	// since "this assignment is cancelled" would be the wrong sentence for it.
	const planOpen = assignment !== null && canEditPlan(assignment.status);
	const editable = planOpen && canSubmit;

	// A date with no time, or a time with no date, is not a deadline and is not
	// saved as one: refused here rather than written as null, which would drop a
	// deadline the operator was halfway through changing.
	const detailsSaveable =
		values !== null && values.assignmentDate !== '' && !deadlineHalfEntered(values);

	const saveDetails = async () => {
		if (detailDraft === null || !detailsSaveable) {
			return;
		}
		setSavingDetails(true);
		setError(null);
		try {
			await updateDetails(id, {
				assignmentName: assignmentNameOrNull(detailDraft),
				assignmentDate: detailDraft.assignmentDate,
				assignedToProfileId: assigneeOrNull(detailDraft),
				dueAt: toDueAt(detailDraft, timeZone),
			});
			setDetailDraft(null);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to save these details.'));
		}
		setSavingDetails(false);
	};

	const addStop = async (selection: AssignmentTargetSelection) => {
		setError(null);
		// The picker speaks the page's vocabulary; the row speaks the column's.
		// `serviceRequest` is the only member the two spell differently, which is
		// why this conversion has to be explicit, and it sits above the try because
		// the React Compiler bails on a component whose try block branches (#856).
		const targetType = selection.type === 'serviceRequest' ? 'service_request' : selection.type;
		try {
			await items.addStop({
				assignmentId: id,
				target: { type: targetType, id: selection.id },
				position: stops.reduce((max, stop) => Math.max(max, stop.position), -1) + 1,
			});
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to add the stop.'));
		}
	};

	const move = async (index: number, action: MoveAction) => {
		setError(null);
		try {
			await moveStop(index, action);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to reorder the assignment.'));
		}
	};

	const saveDirections = async (assignmentItemId: string, value: string) => {
		setError(null);
		try {
			await items.setDirections(assignmentItemId, value);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to save directions.'));
		}
	};

	const confirmRemove = async () => {
		const target = removeTarget;
		setRemoveTarget(null);
		if (target === null) {
			return;
		}
		setError(null);
		try {
			await items.removeStop(target.assignmentItemId);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to remove the stop.'));
		}
	};

	const body = (
		<>
			<MapSplitPage
				map={
					<WorklistMap
						features={features}
						fitKey={id}
						highlightId={highlightId}
						recordType="assignment"
						onHoverStop={setHighlightId}
						onSelectStop={setSelectedStopId}
						selectedId={selectedStopId}
						stopCount={stops.length}
					/>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="grid gap-4 border-border/50 border-b p-4">
						<div className="flex items-center justify-between gap-3">
							<Link
								className="inline-flex items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id }}
								to="/operations/assignments/$id"
							>
								<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
								Done
							</Link>
							{assignment === null ? null : <AssignmentStatusBadge status={assignment.status} />}
						</div>

						{assignment !== null && !planOpen ? (
							<Alert>
								<AlertDescription>
									{`This assignment is ${assignment.status === 'completed' ? 'completed' : 'cancelled'}. Reopen it on the run page to change the plan.`}
								</AlertDescription>
							</Alert>
						) : null}

						{values === null ? (
							<div className="grid gap-3">
								<Skeleton className="h-9 rounded-md" />
								<Skeleton className="h-9 rounded-md" />
							</div>
						) : (
							<div className="grid gap-3">
								<AssignmentDetailFields
									assigneeOptions={assigneeOptions}
									disabled={!editable || savingDetails}
									onChange={setDetailDraft}
									values={values}
								/>
								{isDirty ? (
									<div className="flex items-center gap-2">
										<Button
											disabled={!canSubmit || savingDetails || !detailsSaveable}
											onClick={() => void saveDetails()}
											size="sm"
											type="button"
										>
											{savingDetails ? <Spinner /> : null}
											Save Details
										</Button>
										<Button
											disabled={savingDetails}
											onClick={() => setDetailDraft(null)}
											size="sm"
											type="button"
											variant="ghost"
										>
											Discard
										</Button>
									</div>
								) : null}
							</div>
						)}

						{editable && organizationId !== null ? (
							<AssignmentTargetPicker
								existingKeys={existingKeys}
								onAdd={(selection) => void addStop(selection)}
								organizationId={organizationId}
							/>
						) : null}

						{error === null ? null : (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</div>

					<PlanStopList
						editable={editable}
						highlightId={highlightId}
						isLoading={isLoading}
						onHover={setHighlightId}
						onMove={move}
						onRemove={setRemoveTarget}
						onSaveDirections={saveDirections}
						onSelect={setSelectedStopId}
						selectedStopId={selectedStopId}
						stops={orderedStops}
					/>

					{assignment === null || !canSubmit ? null : (
						<div className="shrink-0 border-border/40 border-t p-3">
							<DangerZoneCard
								ask={askDelete}
								name={displayName ?? 'this assignment'}
								onDelete={(acknowledgements) => removeAssignment(assignment.id, acknowledgements)}
								recordId={assignment.id}
								recordType="assignment"
								returnTo="/operations/assignments"
							/>
						</div>
					)}
				</div>
			</MapSplitPage>

			<AlertDialog
				onOpenChange={(open) => !open && setRemoveTarget(null)}
				open={removeTarget !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove This Stop?</AlertDialogTitle>
						<AlertDialogDescription>
							{removeTarget?.target?.name ?? 'This stop'} comes off the worklist and the stops after
							it move up. The record itself isn't deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep Stop</AlertDialogCancel>
						<AlertDialogAction onClick={confirmRemove}>Remove Stop</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);

	// The dialog sits outside the frame, not inside the body. The delete is
	// optimistic, so the assignment leaves its collection the moment the button
	// is pressed and the frame swaps the body for "not found" before the
	// registry's refusal lands; a dialog held in the body would unmount with it
	// and the question would never be asked.
	return (
		<>
			<RecordEditFrame
				recordType="assignment"
				reading={{ isError, isReady, record: assignment }}
				skeleton={<EditFormSkeleton rows={['h-9', 'h-16', 'h-16', 'h-16']} />}
			>
				{() => body}
			</RecordEditFrame>
			{acknowledgementDialog}
		</>
	);
}

function PlanStopList({
	stops,
	editable,
	isLoading,
	selectedStopId,
	highlightId,
	onMove,
	onRemove,
	onSaveDirections,
	onSelect,
	onHover,
}: {
	readonly stops: readonly AssignmentStopView[];
	readonly editable: boolean;
	readonly isLoading: boolean;
	readonly selectedStopId: string | null;
	readonly highlightId: string | null;
	readonly onMove: (index: number, action: MoveAction) => void;
	readonly onRemove: (stop: AssignmentStopView) => void;
	readonly onSaveDirections: (assignmentItemId: string, value: string) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	return (
		<StopList
			className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-3"
			empty={{
				title: 'No Stops Yet',
				description:
					'Add traps, habitats, and service requests above, in the order the crew should work them.',
			}}
			isEmpty={stops.length === 0}
			isLoading={isLoading}
		>
			{stops.map((stop, index) => (
				<PlanStopRow
					editable={editable}
					index={index}
					isFirst={index === 0}
					isHighlighted={stop.assignmentItemId === highlightId}
					isLast={index === stops.length - 1}
					isSelected={stop.assignmentItemId === selectedStopId}
					key={stop.assignmentItemId}
					onHover={onHover}
					onMove={onMove}
					onRemove={onRemove}
					onSaveDirections={onSaveDirections}
					onSelect={onSelect}
					ordinal={index + 1}
					stop={stop}
				/>
			))}
		</StopList>
	);
}

function PlanStopRow({
	stop,
	ordinal,
	index,
	editable,
	isFirst,
	isLast,
	isSelected,
	isHighlighted,
	onMove,
	onRemove,
	onSaveDirections,
	onSelect,
	onHover,
}: {
	readonly stop: AssignmentStopView;
	readonly ordinal: number;
	readonly index: number;
	readonly editable: boolean;
	readonly isFirst: boolean;
	readonly isLast: boolean;
	readonly isSelected: boolean;
	readonly isHighlighted: boolean;
	readonly onMove: (index: number, action: MoveAction) => void;
	readonly onRemove: (stop: AssignmentStopView) => void;
	readonly onSaveDirections: (assignmentItemId: string, value: string) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected || isHighlighted
					? 'border-primary/40 ring-1 ring-primary/25'
					: 'border-border/60',
			)}
			onMouseEnter={() => onHover(stop.assignmentItemId)}
			onMouseLeave={() => onHover(null)}
		>
			{/* Full-card target selects the stop on the map; interactive bits opt back in. */}
			<button
				aria-label={`Show stop ${ordinal} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full rounded-lg transition-colors',
					isSelected ? 'bg-primary/5' : 'hover:bg-muted/40',
				)}
				onClick={() => onSelect(isSelected ? null : stop.assignmentItemId)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-start gap-3 p-3">
				<OrdinalBadge ordinal={ordinal} tone={assignmentStopTone(stop)} />

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="pointer-events-auto min-w-0">
							<TargetLink isResolving={stop.isResolving} target={stop.target} />
						</span>
						<TargetTypePill type={stop.entityType} />
						<ItemProgressBadge progress={stop.progress} />
						<span aria-hidden="true" className="min-w-0 flex-1" />
						{editable ? (
							<StopReorderControls
								extraActions={
									<DropdownMenuItem onClick={() => onRemove(stop)} variant="destructive">
										Remove from assignment
									</DropdownMenuItem>
								}
								index={index}
								isFirst={isFirst}
								isLast={isLast}
								onMove={onMove}
							/>
						) : null}
					</div>

					{stop.target?.secondary == null ? null : (
						<p className="m-0 mt-1 truncate text-muted-foreground text-xs">
							{stop.target.secondary}
						</p>
					)}

					<div className="mt-2">
						<InlineEditField
							ariaLabel={`Directions after stop ${ordinal}`}
							disabled={!editable}
							emptyLabel="Add directions to the next stop"
							onSave={(value) => onSaveDirections(stop.assignmentItemId, value)}
							renderValue={(value) => (
								<span className="flex items-start gap-1.5 text-muted-foreground text-xs">
									<ChevronRightIcon
										aria-hidden="true"
										className="mt-px size-3 shrink-0 rotate-90 text-muted-foreground/70"
									/>
									<span className="min-w-0 whitespace-pre-wrap">{value}</span>
								</span>
							)}
							textareaPlaceholder="e.g. Turn left at the pump station; gate code 4821."
							value={stop.directionsToNextItem ?? ''}
						/>
					</div>
				</div>
			</div>
		</li>
	);
}
