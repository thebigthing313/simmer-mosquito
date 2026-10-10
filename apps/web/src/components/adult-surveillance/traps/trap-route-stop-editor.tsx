import { DropdownMenuItem } from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import type { TrapRouteStopView } from '../../../hooks/adult-surveillance/use-trap-route-stops';
import {
	type MoveAction,
	OrdinalBadge,
	ResolvingStatus,
	StopReorderControls,
} from '../../stop-order';
import { trapStopBadgeTone } from './trap-route-data';

/**
 * The stop list on the Trap Route edit page: each stop's ordinal, name and
 * status, the reorder and remove menu, and the directions to the next stop.
 * Draws skeletons while the first load is in flight and an empty state for a
 * Route with no stops.
 *
 * Takes the stops in display order, whether the viewer may write, whether the
 * stops are loading, and a callback per control.
 */
export function TrapRouteStopEditor({
	stops,
	canSubmit,
	isLoading,
	onMove,
	onRemove,
	onSetDirections,
}: {
	readonly stops: readonly TrapRouteStopView[];
	readonly canSubmit: boolean;
	readonly isLoading: boolean;
	readonly onMove: (index: number, action: MoveAction) => void;
	readonly onRemove: (routeItemId: string) => void;
	readonly onSetDirections: (routeItemId: string, value: string) => void;
}) {
	if (isLoading && stops.length === 0) {
		return (
			<div className="grid gap-2">
				{['sk-1', 'sk-2', 'sk-3'].map((key) => (
					<Skeleton className="h-16 rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (stops.length === 0) {
		return (
			<Empty className="min-h-[160px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>No Stops Yet</EmptyTitle>
					<EmptyDescription>Add traps above to build this route.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ol className="grid gap-2">
			{stops.map((stop, index) => (
				<li
					className="grid gap-2 rounded-lg border border-border/50 bg-card p-3"
					key={stop.routeItemId}
				>
					<div className="flex items-center gap-3">
						<OrdinalBadge ordinal={index + 1} tone={trapStopBadgeTone(stop)} />
						<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
							{stop.name}
						</span>
						<TrapStopEditStatus stop={stop} />
						{canSubmit ? (
							<StopReorderControls
								extraActions={
									<DropdownMenuItem
										onClick={() => onRemove(stop.routeItemId)}
										variant="destructive"
									>
										Remove from route
									</DropdownMenuItem>
								}
								count={stops.length}
								index={index}
								onMove={onMove}
							/>
						) : null}
					</div>
					{index < stops.length - 1 ? (
						<Input
							aria-label={`Directions from ${stop.name} to the next stop`}
							className="h-8 text-xs"
							defaultValue={stop.directionsToNextItem ?? ''}
							disabled={!canSubmit}
							key={stop.routeItemId}
							onBlur={(event) => onSetDirections(stop.routeItemId, event.target.value)}
							placeholder="Directions to the next stop"
						/>
					) : null}
				</li>
			))}
		</ol>
	);
}

/**
 * The word beside the name. The badge's fill is hidden from assistive
 * technology, so the word carries the status: `Loading…` while the Trap has
 * not arrived, `Inactive` for an inactive one, nothing for an active one.
 */
function TrapStopEditStatus({ stop }: { readonly stop: TrapRouteStopView }) {
	if (stop.isResolving) {
		return <ResolvingStatus />;
	}
	return stop.isActive ? null : (
		<span className="shrink-0 text-muted-foreground text-xs">Inactive</span>
	);
}
