import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
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
import {
	ArrowLeftIcon,
	ChevronRightIcon,
	iconRegistry,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	CollectCollectionDialog,
	collectPendingCollection,
} from '../../../components/collect-collection-dialog';
import { ReasonDialog } from '../../../components/reason-dialog';
import { OrdinalBadge } from '../../../components/stop-order';
import { WriteOnly } from '../../../components/write-only';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { todayInTimeZone } from '../../adult-surveillance/-overview-data';
import { useCommandRunner } from '../-command-runner';
import { StopProgressSummary } from '../-operations-display';
import { WorklistMap } from '../-worklist-map';
import { WorklistTabs } from '../-worklist-tabs';
import {
	type AssignmentStopView,
	type AssignmentView,
	assignmentDisplayName,
	assignmentStopTone,
	canCompleteAssignment,
	cancelAssignment,
	canProgressItems,
	canRecordStopWork,
	canStartAssignment,
	completeAssignment,
	completeAssignmentItem,
	type ItemAction,
	itemActionsFor,
	type ProgressCounts,
	reopenAssignment,
	reopenAssignmentItem,
	skipAssignmentItem,
	startAssignment,
	unskipAssignmentItem,
	useAssigneeOptions,
	useAssignment,
	useAssignmentStops,
} from './-assignment-data';
import {
	AssignmentStatusBadge,
	formatAssignmentDate,
	formatDueAt,
	ItemProgressBadge,
	TargetLink,
	TargetTypePill,
} from './-assignment-display';

const AssignmentIcon = iconRegistry.entities.vehicle.icon;
const EditIcon = iconRegistry.actions.edit.icon;

export const Route = createFileRoute('/operations/assignments/$id')({
	component: AssignmentRunRoute,
});

/**
 * Working a worklist: start it, mark each stop, close it out.
 *
 * Every control here writes a timestamp and nothing else — the PATCH handler
 * reads which timestamp changed and derives the command from that. Which is
 * also why a stop's buttons follow the server's precedence rather than the
 * intuitive one: `skippedAt` is checked before `completedAt`, so a skipped stop
 * offers Unskip and never Complete.
 */
function AssignmentRunRoute() {
	const { id } = Route.useParams();
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;

	const { assignment, isReady } = useAssignment(id);
	const { stops, features, counts, isLoading } = useAssignmentStops(id);
	const { nameById } = useAssigneeOptions();

	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [skipTarget, setSkipTarget] = useState<AssignmentStopView | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);
	const { busy, error, run } = useCommandRunner();

	const assigneeName =
		assignment?.assignedToProfileId == null
			? null
			: (nameById.get(assignment.assignedToProfileId) ?? null);
	const displayName = assignment === null ? null : assignmentDisplayName(assignment, assigneeName);
	useBreadcrumbLabel(id, displayName);

	const itemAction = useCallback(
		(stop: AssignmentStopView, action: ItemAction) => {
			if (action === 'skip') {
				setSkipTarget(stop);
				return;
			}
			const profileId = identity?.profileId ?? null;
			void run(
				() =>
					action === 'complete'
						? completeAssignmentItem(stop.assignmentItemId, profileId)
						: action === 'unskip'
							? unskipAssignmentItem(stop.assignmentItemId)
							: reopenAssignmentItem(stop.assignmentItemId),
				'Unable to update that stop.',
			);
		},
		[identity, run],
	);

	const confirmSkip = useCallback(
		(reason: string) => {
			const target = skipTarget;
			setSkipTarget(null);
			if (target === null) {
				return;
			}
			void run(
				() => skipAssignmentItem(target.assignmentItemId, reason, identity?.profileId ?? null),
				'Unable to skip that stop.',
			);
		},
		[skipTarget, identity, run],
	);

	const confirmCancel = useCallback(
		(reason: string) => {
			setCancelOpen(false);
			void run(
				() => cancelAssignment(id, reason.trim().length === 0 ? null : reason.trim()),
				'Unable to cancel this assignment.',
			);
		},
		[id, run],
	);

	if (isReady && assignment === null) {
		return <AssignmentNotFound />;
	}

	const itemsEnabled = assignment !== null && canProgressItems(assignment.status) && !busy;
	// Wider than `itemsEnabled` on purpose: recording auto-starts the assignment.
	const recordEnabled = assignment !== null && canRecordStopWork(assignment.status) && !busy;

	return (
		<>
			<MapSplitPage
				map={
					<WorklistMap
						features={features}
						fitKey={id}
						highlightId={highlightId}
						noun="assignment"
						onHoverStop={setHighlightId}
						onSelectStop={setSelectedStopId}
						selectedId={selectedStopId}
						stopCount={stops.length}
					/>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
						<Link
							className="inline-flex w-fit items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							to="/operations/assignments"
						>
							<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
							Assignments
						</Link>

						{assignment === null ? (
							<div className="grid gap-2">
								<Skeleton className="h-6 w-56" />
								<Skeleton className="h-4 w-40" />
							</div>
						) : (
							<>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<h1 className="flex items-center gap-2 font-semibold text-foreground text-lg leading-tight">
											<AssignmentIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
											<span className="min-w-0 truncate">{displayName}</span>
										</h1>
										<p className="m-0 mt-0.5 text-muted-foreground text-sm">
											{formatAssignmentDate(assignment.assignmentDate)} ·{' '}
											{assigneeName ?? 'Unassigned'}
											{formatDueAt(assignment.dueAt) === null
												? ''
												: ` · due ${formatDueAt(assignment.dueAt)}`}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<AssignmentStatusBadge status={assignment.status} />
										<WriteOnly minimum="manager">
											<Button asChild size="sm" variant="outline">
												<Link params={{ id }} to="/operations/assignments/$id/edit">
													<EditIcon aria-hidden="true" />
													Edit Plan
												</Link>
											</Button>
										</WriteOnly>
									</div>
								</div>

								<StopProgressSummary
									counts={counts}
									emptyLabel="No stops on this assignment yet."
								/>

								<WriteOnly>
									<LifecycleControls
										assignment={assignment}
										busy={busy}
										counts={counts}
										onCancel={() => setCancelOpen(true)}
										onComplete={() =>
											void run(() => completeAssignment(id), 'Unable to complete this assignment.')
										}
										onReopen={() =>
											void run(() => reopenAssignment(id), 'Unable to reopen this assignment.')
										}
										onStart={() =>
											void run(() => startAssignment(id), 'Unable to start this assignment.')
										}
									/>
								</WriteOnly>

								{assignment.status === 'cancelled' && assignment.cancellationReason !== null ? (
									<p className="m-0 text-muted-foreground text-sm">
										Cancelled: {assignment.cancellationReason}
									</p>
								) : null}
							</>
						)}

						{error === null ? null : (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</div>

					<WorklistTabs
						commentsDescription="Field notes and follow-up for this assignment."
						stopCount={stops.length}
						target={{ type: 'assignment', id }}
					>
						<RunStopList
							actorProfileId={identity?.profileId ?? null}
							assignmentId={id}
							enabled={itemsEnabled}
							recordEnabled={recordEnabled}
							highlightId={highlightId}
							isLoading={isLoading}
							onAction={itemAction}
							onHover={setHighlightId}
							onSelect={setSelectedStopId}
							selectedStopId={selectedStopId}
							stops={stops}
						/>
					</WorklistTabs>
				</div>
			</MapSplitPage>

			<ReasonDialog
				confirmLabel="Skip Stop"
				description={`${skipTarget?.target?.name ?? 'This stop'} stays on the worklist with its place in the order. Say why it was passed over.`}
				onConfirm={confirmSkip}
				onOpenChange={(open) => !open && setSkipTarget(null)}
				open={skipTarget !== null}
				placeholder="e.g. Locked gate, dog in the yard, standing water gone."
				required
				title="Skip This Stop?"
			/>

			<ReasonDialog
				confirmLabel="Cancel Assignment"
				description="The worklist stays on record with whatever was already done. A reason helps whoever reads it later."
				onConfirm={confirmCancel}
				onOpenChange={setCancelOpen}
				open={cancelOpen}
				placeholder="e.g. Called off for weather."
				required={false}
				title="Cancel This Assignment?"
			/>
		</>
	);
}

/**
 * The lifecycle controls, one set per state.
 *
 * Start and Complete carry preconditions the server also enforces; they are
 * disabled rather than hidden, because "why can't I finish this?" is a question
 * about the work in front of you, not about your account — and the answer is
 * right there in the counts above.
 */
function LifecycleControls({
	assignment,
	counts,
	busy,
	onStart,
	onComplete,
	onCancel,
	onReopen,
}: {
	readonly assignment: AssignmentView;
	readonly counts: ProgressCounts;
	readonly busy: boolean;
	readonly onStart: () => void;
	readonly onComplete: () => void;
	readonly onCancel: () => void;
	readonly onReopen: () => void;
}) {
	if (assignment.status === 'completed' || assignment.status === 'cancelled') {
		return (
			<div className="flex flex-wrap gap-2">
				<WriteOnly minimum="manager">
					<Button disabled={busy} onClick={onReopen} size="sm" variant="outline">
						Reopen
					</Button>
				</WriteOnly>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{assignment.status === 'notStarted' ? (
				<Button
					disabled={busy || !canStartAssignment(assignment.status, counts)}
					onClick={onStart}
					size="sm"
				>
					Start
				</Button>
			) : (
				<Button
					disabled={busy || !canCompleteAssignment(assignment.status, counts)}
					onClick={onComplete}
					size="sm"
				>
					Complete
				</Button>
			)}
			<WriteOnly minimum="manager">
				<Button disabled={busy} onClick={onCancel} size="sm" variant="outline">
					Cancel
				</Button>
			</WriteOnly>
			{assignment.status === 'inProgress' && counts.pending > 0 ? (
				<span className="self-center text-muted-foreground text-xs">
					{counts.pending === 1 ? '1 stop still pending' : `${counts.pending} stops still pending`}
				</span>
			) : null}
		</div>
	);
}

function RunStopList({
	actorProfileId,
	assignmentId,
	stops,
	enabled,
	recordEnabled,
	isLoading,
	selectedStopId,
	highlightId,
	onAction,
	onSelect,
	onHover,
}: {
	readonly actorProfileId: string | null;
	readonly assignmentId: string;
	readonly stops: readonly AssignmentStopView[];
	readonly enabled: boolean;
	readonly recordEnabled: boolean;
	readonly isLoading: boolean;
	readonly selectedStopId: string | null;
	readonly highlightId: string | null;
	readonly onAction: (stop: AssignmentStopView, action: ItemAction) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	if (isLoading && stops.length === 0) {
		return (
			<div className="grid gap-2 p-3">
				{['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'].map((key) => (
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
						<EmptyTitle>No Stops on This Assignment</EmptyTitle>
						<EmptyDescription>
							An assignment needs at least one stop before it can be started.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<WriteOnly minimum="manager">
							<Button asChild>
								<Link params={{ id: assignmentId }} to="/operations/assignments/$id/edit">
									<EditIcon aria-hidden="true" />
									Add Stops
								</Link>
							</Button>
						</WriteOnly>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	return (
		<ol className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-3">
			{stops.map((stop) => (
				<RunStopRow
					actorProfileId={actorProfileId}
					assignmentId={assignmentId}
					enabled={enabled}
					recordEnabled={recordEnabled}
					isHighlighted={stop.assignmentItemId === highlightId}
					isSelected={stop.assignmentItemId === selectedStopId}
					key={stop.assignmentItemId}
					onAction={onAction}
					onHover={onHover}
					onSelect={onSelect}
					stop={stop}
				/>
			))}
		</ol>
	);
}

const ACTION_LABELS: Readonly<Record<ItemAction, string>> = {
	complete: 'Done',
	skip: 'Skip',
	unskip: 'Unskip',
	reopen: 'Reopen',
};

/**
 * The record a stop exists to produce.
 *
 * Recording it is the ordinary way to finish a stop — the server writes the
 * record, links it, and completes the stop in one transaction. "Done" stays
 * beside it for the corrections and for the stops that produce nothing
 * linkable, which is every service request stop today.
 */
function RecordStopWorkButton({
	stop,
	assignmentId,
	actorProfileId,
	enabled,
}: {
	readonly stop: AssignmentStopView;
	readonly assignmentId: string;
	readonly actorProfileId: string | null;
	readonly enabled: boolean;
}) {
	// The stop's own target rides along, so the form opens on the place the crew
	// was sent rather than asking them to find it again. Left out, the server
	// would default it anyway — but the field is required client-side, so the
	// crew re-picks it, and a wrong pick is a target mismatch rather than a typo.
	const search = { assignmentItemId: stop.assignmentItemId, assignmentId };

	if (stop.entityType === 'habitat') {
		return (
			<Button asChild={enabled} disabled={!enabled} size="sm" variant="default">
				{enabled ? (
					<Link
						search={{ ...search, habitatId: stop.entityId }}
						to="/larval-surveillance/inspections/create"
					>
						Record inspection
					</Link>
				) : (
					<span>Record inspection</span>
				)}
			</Button>
		);
	}

	if (stop.entityType === 'trap') {
		// A trap with a collection already out on it is the second visit of two:
		// the work here is emptying what somebody set, not setting a new one.
		if (stop.pendingCollectionId !== null) {
			return (
				<CollectStopButton
					actorProfileId={actorProfileId}
					collectionId={stop.pendingCollectionId}
					enabled={enabled}
					stop={stop}
				/>
			);
		}
		return (
			<Button asChild={enabled} disabled={!enabled} size="sm" variant="default">
				{enabled ? (
					<Link
						search={{ ...search, trapId: stop.entityId }}
						to="/adult-surveillance/collections/create"
					>
						Record collection
					</Link>
				) : (
					<span>Record collection</span>
				)}
			</Button>
		);
	}

	// Service request stops have no single record to point at, so they keep the
	// two-step flow: handle the request, then mark the stop done.
	return null;
}

/**
 * Emptying the trap this stop was sent to, without leaving the worklist.
 *
 * The collection already exists, so there is no form to open — only the date to
 * confirm. The write links the collection to this stop and completes it in one
 * transaction, the same as the create path does for a first visit.
 */
function CollectStopButton({
	stop,
	collectionId,
	actorProfileId,
	enabled,
}: {
	readonly stop: AssignmentStopView;
	readonly collectionId: string;
	readonly actorProfileId: string | null;
	readonly enabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite();

	return (
		<>
			<Button disabled={!enabled} onClick={() => setOpen(true)} size="sm" variant="default">
				Collect
			</Button>
			<CollectCollectionDialog
				defaultDate={todayInTimeZone(undefined)}
				onConfirm={(collectedAt) => {
					setOpen(false);
					void runAcknowledged((acknowledgements) =>
						collectPendingCollection({
							acknowledgements,
							actorProfileId,
							assignmentItemId: stop.assignmentItemId,
							collectedAt,
							collectionId,
						}),
					);
				}}
				onOpenChange={setOpen}
				open={open}
			/>
			{acknowledgeDialog}
		</>
	);
}

function RunStopRow({
	stop,
	actorProfileId,
	assignmentId,
	enabled,
	recordEnabled,
	isSelected,
	isHighlighted,
	onAction,
	onSelect,
	onHover,
}: {
	readonly stop: AssignmentStopView;
	readonly actorProfileId: string | null;
	readonly assignmentId: string;
	readonly enabled: boolean;
	readonly recordEnabled: boolean;
	readonly isSelected: boolean;
	readonly isHighlighted: boolean;
	readonly onAction: (stop: AssignmentStopView, action: ItemAction) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	const actions = itemActionsFor(stop.progress);

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
				aria-label={`Show stop ${stop.ordinal} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full rounded-lg transition-colors',
					isSelected ? 'bg-primary/5' : 'hover:bg-muted/40',
				)}
				onClick={() => onSelect(isSelected ? null : stop.assignmentItemId)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-start gap-3 p-3">
				<OrdinalBadge ordinal={stop.ordinal} tone={assignmentStopTone(stop)} />

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="pointer-events-auto min-w-0">
							<TargetLink isResolving={stop.isResolving} target={stop.target} />
						</span>
						<TargetTypePill type={stop.entityType} />
						<ItemProgressBadge progress={stop.progress} />
					</div>

					{stop.target?.secondary == null ? null : (
						<p className="m-0 mt-1 truncate text-muted-foreground text-xs">
							{stop.target.secondary}
						</p>
					)}

					{stop.skipReason === null ? null : (
						<p className="m-0 mt-1 text-muted-foreground text-xs">Skipped: {stop.skipReason}</p>
					)}

					{stop.directionsToNextItem === null ? null : (
						<p className="m-0 mt-1 flex items-start gap-1.5 text-muted-foreground text-xs">
							<ChevronRightIcon
								aria-hidden="true"
								className="mt-px size-3 shrink-0 rotate-90 text-muted-foreground/70"
							/>
							<span className="min-w-0 whitespace-pre-wrap">{stop.directionsToNextItem}</span>
						</p>
					)}

					<WriteOnly>
						<div className="pointer-events-auto mt-2 flex flex-wrap gap-2">
							{stop.progress === 'pending' ? (
								<RecordStopWorkButton
									actorProfileId={actorProfileId}
									assignmentId={assignmentId}
									enabled={recordEnabled}
									stop={stop}
								/>
							) : null}
							{actions.map((action) => (
								<Button
									disabled={!enabled}
									key={action}
									onClick={() => onAction(stop, action)}
									size="sm"
									variant="outline"
								>
									{ACTION_LABELS[action]}
								</Button>
							))}
						</div>
					</WriteOnly>
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
