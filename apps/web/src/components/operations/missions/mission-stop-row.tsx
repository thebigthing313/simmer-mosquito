import type { ControlType } from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { DropdownMenuItem } from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import { controlTypeLabel, requestDisplayName } from '../../../hooks/queries/operations-view';
import { type MoveAction, OrdinalBadge, StopReorderControls } from '../../stop-order';
import { WriteOnly } from '../../write-only';
import {
	type MissionItemAction,
	type MissionStopView,
	missionItemActionsFor,
} from '../operations-data';
import { MissionItemProgressBadge, missionStopTone } from '../operations-display';

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

export function MissionStopRow({
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
