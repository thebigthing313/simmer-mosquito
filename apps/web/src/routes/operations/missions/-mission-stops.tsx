import type { ControlType } from '@simmer-mosquito/domain';
import type { RequestedControlActionRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { DropdownMenuItem } from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import { useMemo, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../../components/pickers/entity-picker';
import {
	type MoveAction,
	OrdinalBadge,
	StopList,
	StopReorderControls,
} from '../../../components/stop-order';
import { WriteOnly } from '../../../components/write-only';
import { controlTypeLabel, requestDisplayName } from '../../../hooks/queries/operations-view';
import {
	type MissionItemAction,
	type MissionStopView,
	missionItemActionsFor,
	useOpenRequestedControlActions,
} from '../-operations-data';
import { MissionItemProgressBadge, missionStopTone } from '../-operations-display';

const _MoreIcon = iconRegistry.arrows.moreHorizontal.icon;

const ACTION_LABELS: Readonly<Record<MissionItemAction, string>> = {
	complete: 'Done',
	skip: 'Skip',
	unskip: 'Unskip',
	reopen: 'Reopen',
};

/** Where each kind of mission sends the crew to record what they did. */
const RECORD_ROUTE: Readonly<Record<ControlType, { readonly to: string; readonly label: string }>> =
	{
		application: { to: '/control-operations/chemical/create', label: 'Record application' },
		source_reduction: {
			to: '/control-operations/source-reduction/create',
			label: 'Record source reduction',
		},
		biocontrol: { to: '/control-operations/biocontrol/create', label: 'Record biocontrol' },
		outreach: { to: '/public-engagement/outreach/create', label: 'Record outreach' },
	};

/**
 * The control action a mission stop exists to produce.
 *
 * The mission is typed once at the parent, so the stop does not choose — it
 * offers the one kind of record this mission is for. Recording it writes the
 * action, links it to the stop, and completes the stop together.
 */
function RecordMissionWorkButton({
	stop,
	controlType,
	missionId,
	enabled,
}: {
	readonly stop: MissionStopView;
	readonly controlType: ControlType | null;
	readonly missionId: string;
	readonly enabled: boolean;
}) {
	// The mission is what says which record this stop produces, so there is
	// nothing to offer until its row has arrived.
	if (controlType === null) {
		return null;
	}
	const route = RECORD_ROUTE[controlType];
	const search = { missionItemId: stop.missionItemId, missionId };

	return (
		<Button asChild={enabled} disabled={!enabled} size="sm" variant="default">
			{enabled ? (
				<Link search={search} to={route.to}>
					{route.label}
				</Link>
			) : (
				<span>{route.label}</span>
			)}
		</Button>
	);
}

/**
 * A mission's stop list: what the crew works, in order.
 *
 * Two sets of controls sit on each row and they answer to different roles. The
 * progress buttons are the assigned collector's — that is the mission being
 * worked. The move and remove controls are a manager's, because they change what
 * the mission *is*. Both are gated by the caller rather than here, so this
 * component only decides what a stop looks like.
 */
export function MissionStopList({
	stops,
	controlType,
	missionId,
	isLoading,
	progressEnabled,
	recordEnabled,
	planEditable,
	selectedStopId,
	highlightId,
	onAction,
	onMove,
	onRemove,
	onSelect,
	onHover,
}: {
	readonly stops: readonly MissionStopView[];
	/** Null until the mission row has streamed; the record button waits for it. */
	readonly controlType: ControlType | null;
	readonly missionId: string;
	readonly isLoading: boolean;
	/** The mission is running and no write is in flight. */
	readonly progressEnabled: boolean;
	/** Wider: recording is also allowed on a scheduled mission, which it starts. */
	readonly recordEnabled: boolean;
	/** The mission is still open to plan changes. */
	readonly planEditable: boolean;
	readonly selectedStopId: string | null;
	readonly highlightId: string | null;
	readonly onAction: (stop: MissionStopView, action: MissionItemAction) => void;
	readonly onMove: (index: number, action: MoveAction) => void;
	readonly onRemove: (stop: MissionStopView) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	return (
		<StopList
			className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-3"
			empty={{
				title: 'No Stops on This Mission',
				description:
					'A mission needs at least one stop before it can be started. Add them from the request queue above.',
			}}
			isEmpty={stops.length === 0}
			isLoading={isLoading}
		>
			{stops.map((stop, index) => (
				<MissionStopRow
					controlType={controlType}
					index={index}
					isFirst={index === 0}
					isHighlighted={stop.missionItemId === highlightId}
					isLast={index === stops.length - 1}
					isSelected={stop.missionItemId === selectedStopId}
					key={stop.missionItemId}
					onAction={onAction}
					onHover={onHover}
					onMove={onMove}
					onRemove={onRemove}
					missionId={missionId}
					onSelect={onSelect}
					ordinal={index + 1}
					planEditable={planEditable}
					progressEnabled={progressEnabled}
					recordEnabled={recordEnabled}
					stop={stop}
				/>
			))}
		</StopList>
	);
}

function MissionStopRow({
	stop,
	controlType,
	missionId,
	ordinal,
	index,
	isFirst,
	isLast,
	isSelected,
	isHighlighted,
	progressEnabled,
	recordEnabled,
	planEditable,
	onAction,
	onMove,
	onRemove,
	onSelect,
	onHover,
}: {
	readonly stop: MissionStopView;
	readonly controlType: ControlType | null;
	readonly missionId: string;
	readonly ordinal: number;
	readonly index: number;
	readonly isFirst: boolean;
	readonly isLast: boolean;
	readonly isSelected: boolean;
	readonly isHighlighted: boolean;
	readonly progressEnabled: boolean;
	readonly recordEnabled: boolean;
	readonly planEditable: boolean;
	readonly onAction: (stop: MissionStopView, action: MissionItemAction) => void;
	readonly onMove: (index: number, action: MoveAction) => void;
	readonly onRemove: (stop: MissionStopView) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	const actions = missionItemActionsFor(stop.progress);

	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected || isHighlighted
					? 'border-primary/40 ring-1 ring-primary/25'
					: 'border-border/60',
			)}
			onMouseEnter={() => onHover(stop.missionItemId)}
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
				onClick={() => onSelect(isSelected ? null : stop.missionItemId)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-start gap-3 p-3">
				<OrdinalBadge ordinal={ordinal} tone={missionStopTone(stop)} />

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="pointer-events-auto min-w-0">
							<StopName stop={stop} />
						</span>
						<MissionItemProgressBadge progress={stop.progress} />
						<span aria-hidden="true" className="min-w-0 flex-1" />
						{planEditable ? (
							<StopReorderControls
								extraActions={
									<DropdownMenuItem onClick={() => onRemove(stop)} variant="destructive">
										Remove from mission
									</DropdownMenuItem>
								}
								index={index}
								isFirst={isFirst}
								isLast={isLast}
								onMove={onMove}
							/>
						) : null}
					</div>

					<StopSubtitle stop={stop} />

					{stop.skipReason === null ? null : (
						<p className="m-0 mt-1 text-muted-foreground text-xs">Skipped: {stop.skipReason}</p>
					)}

					<WriteOnly>
						<div className="pointer-events-auto mt-2 flex flex-wrap gap-2">
							{stop.progress === 'pending' ? (
								<RecordMissionWorkButton
									controlType={controlType}
									enabled={recordEnabled}
									missionId={missionId}
									stop={stop}
								/>
							) : null}
							{actions.map((action) => (
								<Button
									disabled={!progressEnabled}
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

/**
 * What a stop is called.
 *
 * A stop owns its geometry, so it is never nameless in the way an assignment
 * stop with a deleted target is — it is simply a place on the map. The request
 * it came from names it when there is one, and links back so the reason for the
 * visit is one click away.
 */
function StopName({ stop }: { readonly stop: MissionStopView }) {
	if (stop.request !== null) {
		return (
			<Link
				className="font-medium text-foreground text-sm hover:underline"
				params={{ id: stop.request.id }}
				to="/operations/requests-for-control/$id"
			>
				{requestDisplayName(stop.request)}
			</Link>
		);
	}
	if (stop.addressLabel !== null) {
		return <span className="font-medium text-foreground text-sm">{stop.addressLabel}</span>;
	}
	return (
		<span className="font-medium text-foreground text-sm">
			{stop.isResolving ? 'Loading…' : 'Mapped stop'}
		</span>
	);
}

/** The second line: what kind of work the stop's request asked for, and where. */
function StopSubtitle({ stop }: { readonly stop: MissionStopView }) {
	const parts = [
		stop.request === null ? null : controlTypeLabel(stop.request.controlType),
		stop.request === null ? null : stop.addressLabel,
	].filter((part): part is string => part !== null && part.length > 0);

	if (parts.length === 0) {
		return null;
	}
	return <p className="m-0 mt-1 truncate text-muted-foreground text-xs">{parts.join(' · ')}</p>;
}

/**
 * The add-a-stop control: pick an open request, add it to the end.
 *
 * Requests are the only stop source offered because they are the only one the
 * server can place without a drawn shape — it copies the request's own geometry.
 * Requests already on this mission drop out of the list; one already on a
 * *different* mission stays, because sending two crews to the same site is a
 * legitimate plan the domain flags rather than forbids.
 */
export function RequestStopPicker({
	organizationId,
	existingRequestIds,
	disabled = false,
	onAdd,
}: {
	readonly organizationId: string;
	readonly existingRequestIds: ReadonlySet<string>;
	readonly disabled?: boolean;
	readonly onAdd: (request: RequestedControlActionRow) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<RequestedControlActionRow | null>(null);
	const anchorRef = useRef<HTMLDivElement>(null);

	const { requests, isReady } = useOpenRequestedControlActions(organizationId);
	const matches = useRequestMatches(requests, existingRequestIds, search);

	return (
		<div className="grid gap-2">
			<PickerFrame
				anchorRef={anchorRef}
				label="Request for control"
				onClear={() => {
					setSelected(null);
					setSearch('');
				}}
				onOpen={() => setOpen(true)}
				onOpenChange={setOpen}
				onSearchChange={(next) => {
					setSearch(next);
					setOpen(true);
				}}
				open={open}
				placeholder="Search open requests"
				search={search}
				selectedLabel={selected === null ? '' : requestDisplayName(selected)}
				value={selected?.id ?? null}
			>
				{matches.length === 0 ? (
					<PickerFallback label={emptyPickerLabel(isReady, requests.length)} />
				) : (
					<div className="grid gap-1">
						{matches.map((request) => (
							<OptionRow
								key={request.id}
								onSelect={() => {
									setSelected(request);
									setSearch(requestDisplayName(request));
									setOpen(false);
								}}
								primary={requestDisplayName(request)}
								secondary={controlTypeLabel(request.controlType)}
								selected={request.id === selected?.id}
							/>
						))}
					</div>
				)}
			</PickerFrame>

			<div>
				<Button
					disabled={disabled || selected === null}
					onClick={() => {
						if (selected !== null) {
							onAdd(selected);
							setSelected(null);
							setSearch('');
						}
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					Add Stop
				</Button>
			</div>
		</div>
	);
}

/** Open requests not already on this mission, narrowed by the search box. */
function useRequestMatches(
	requests: readonly RequestedControlActionRow[],
	existingRequestIds: ReadonlySet<string>,
	search: string,
): readonly RequestedControlActionRow[] {
	const normalized = search.trim().toLowerCase();
	return useMemo(() => {
		const available = requests.filter((request) => !existingRequestIds.has(request.id));
		const filtered =
			normalized.length === 0
				? available
				: available.filter((request) =>
						requestDisplayName(request).toLowerCase().includes(normalized),
					);
		return filtered.slice(0, PICKER_RESULT_LIMIT);
	}, [requests, existingRequestIds, normalized]);
}

const PICKER_RESULT_LIMIT = 8;

/** Why the picker has nothing to show: still loading, none open, or none matching. */
function emptyPickerLabel(isReady: boolean, openCount: number): string {
	if (!isReady) {
		return 'Loading requests';
	}
	return openCount === 0 ? 'No open requests' : 'No request matches';
}
