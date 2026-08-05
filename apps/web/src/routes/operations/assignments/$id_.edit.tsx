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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import {
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	ChevronUpIcon,
	iconRegistry,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import type { RouteStopFeature } from '../../../components/map';
import {
	InlineEditField,
	type MoveAction,
	type OrderPlacement,
	OrdinalBadge,
	useStopOrder,
} from '../../../components/stop-order';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { isBelowRole } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	type AssignmentStopView,
	addAssignmentItem,
	assignmentDisplayName,
	assignmentStopTone,
	canEditPlan,
	moveAssignmentItems,
	removeAssignmentItem,
	updateAssignmentDetails,
	updateAssignmentItemDirections,
	useAssigneeOptions,
	useAssignment,
	useAssignmentStops,
} from './-assignment-data';
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
	sameAssignmentDetails,
	toAssignmentDetails,
	toDueAt,
} from './-assignment-form';
import { AssignmentMap } from './-assignment-map';
import {
	AssignmentTargetPicker,
	type AssignmentTargetSelection,
} from './-assignment-target-picker';

const AssignmentIcon = iconRegistry.entities.vehicle.icon;
const MoreIcon = iconRegistry.arrows.moreHorizontal.icon;

/** Module-level so the ordering hook's identity stays stable across renders. */
const stopKey = (stop: AssignmentStopView) => stop.assignmentItemId;

export const Route = createFileRoute('/operations/assignments/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
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
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;

	const { assignment, isReady } = useAssignment(id);
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

	const savedDetails = useMemo(
		() => (assignment === null ? null : toAssignmentDetails(assignment)),
		[assignment],
	);
	const values = detailDraft ?? savedDetails;
	const isDirty =
		detailDraft !== null &&
		savedDetails !== null &&
		!sameAssignmentDetails(detailDraft, savedDetails);

	const commitMove = useCallback(
		(movedIds: readonly string[], placement: OrderPlacement) =>
			moveAssignmentItems(id, movedIds, placement),
		[id],
	);
	const { ordered: orderedStops, move: moveStop } = useStopOrder({
		items: stops,
		keyOf: stopKey,
		commit: commitMove,
	});

	// Ordinals come off the *pending* order, not the synced one, so a reorder
	// renumbers the pins on the same frame the list rearranges.
	const features = useMemo<RouteStopFeature[]>(
		() =>
			orderedStops
				.map((stop, index) => ({ stop, ordinal: index + 1 }))
				.filter((entry) => entry.stop.hasLocation)
				.map((entry) => ({
					id: entry.stop.assignmentItemId,
					lng: entry.stop.target?.lng as number,
					lat: entry.stop.target?.lat as number,
					ordinal: entry.ordinal,
					tone: assignmentStopTone(entry.stop),
				})),
		[orderedStops],
	);

	const existingKeys = useMemo(
		() =>
			new Set(
				stops
					.filter((stop) => stop.entityType !== null)
					.map((stop) => `${stop.entityType}:${stop.entityId}`),
			),
		[stops],
	);

	const editable = assignment !== null && canEditPlan(assignment.status);

	const saveDetails = useCallback(async () => {
		if (detailDraft === null || detailDraft.assignmentDate === '') {
			return;
		}
		setSavingDetails(true);
		setError(null);
		try {
			await updateAssignmentDetails(id, {
				assignmentName: assignmentNameOrNull(detailDraft),
				assignmentDate: detailDraft.assignmentDate,
				assignedToProfileId: assigneeOrNull(detailDraft),
				dueAt: toDueAt(detailDraft),
			});
			setDetailDraft(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to save these details.');
		} finally {
			setSavingDetails(false);
		}
	}, [detailDraft, id]);

	const addStop = useCallback(
		async (selection: AssignmentTargetSelection) => {
			if (organizationId === null) {
				return;
			}
			setError(null);
			try {
				await addAssignmentItem({
					assignmentItemId: crypto.randomUUID(),
					assignmentId: id,
					organizationId,
					actorProfileId: identity?.profileId ?? null,
					target: selection,
					position: stops.reduce((max, stop) => Math.max(max, stop.position), -1) + 1,
				});
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Unable to add the stop.');
			}
		},
		[organizationId, identity, id, stops],
	);

	const move = useCallback(
		async (index: number, action: MoveAction) => {
			setError(null);
			try {
				await moveStop(index, action);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Unable to reorder the assignment.');
			}
		},
		[moveStop],
	);

	const saveDirections = useCallback(async (assignmentItemId: string, value: string) => {
		setError(null);
		try {
			await updateAssignmentItemDirections(assignmentItemId, value);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to save directions.');
		}
	}, []);

	const confirmRemove = useCallback(async () => {
		const target = removeTarget;
		setRemoveTarget(null);
		if (target === null) {
			return;
		}
		setError(null);
		try {
			await removeAssignmentItem(target.assignmentItemId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to remove the stop.');
		}
	}, [removeTarget]);

	if (isReady && assignment === null) {
		return <AssignmentNotFound />;
	}

	return (
		<>
			<MapSplitPage
				map={
					<AssignmentMap
						features={features}
						fitKey={id}
						highlightId={highlightId}
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

						{assignment !== null && !editable ? (
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
											disabled={savingDetails || values.assignmentDate === ''}
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

					{assignment === null ? null : (
						<div className="shrink-0 border-border/40 border-t p-3">
							<DangerZoneCard
								name={displayName ?? 'this assignment'}
								noun="assignment"
								onDelete={() => webCollections.assignments.delete(assignment.id)}
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
	if (isLoading && stops.length === 0) {
		return (
			<div className="grid gap-2 p-3">
				{['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((key) => (
					<Skeleton className="h-[76px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (stops.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MapPinnedIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No Stops Yet</EmptyTitle>
						<EmptyDescription>
							Add traps, habitats, and service requests above, in the order the crew should work
							them.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<ol className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-3">
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
		</ol>
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
							<div className="pointer-events-auto flex shrink-0 items-center gap-0.5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											aria-label="Move up"
											className="size-7"
											disabled={isFirst}
											onClick={() => onMove(index, 'up')}
											size="icon"
											variant="ghost"
										>
											<ChevronUpIcon aria-hidden="true" className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Move up one stop</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											aria-label="Move down"
											className="size-7"
											disabled={isLast}
											onClick={() => onMove(index, 'down')}
											size="icon"
											variant="ghost"
										>
											<ChevronDownIcon aria-hidden="true" className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Move down one stop</TooltipContent>
								</Tooltip>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											aria-label="More stop actions"
											className="size-7"
											size="icon"
											variant="ghost"
										>
											<MoreIcon aria-hidden="true" className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem disabled={isFirst} onClick={() => onMove(index, 'top')}>
											Move to top
										</DropdownMenuItem>
										<DropdownMenuItem disabled={isLast} onClick={() => onMove(index, 'bottom')}>
											Move to bottom
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => onRemove(stop)} variant="destructive">
											Remove from assignment
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
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

function AssignmentNotFound() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AssignmentIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Assignment Not Found</EmptyTitle>
					<EmptyDescription>
						This assignment may have been deleted, or the link is out of date.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button asChild variant="outline">
						<Link to="/operations/assignments">
							<ArrowLeftIcon aria-hidden="true" />
							Back to assignments
						</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	);
}
