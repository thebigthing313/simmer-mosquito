import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { TrapRouteStopView } from '../../../hooks/adult-surveillance/use-trap-route-stops';
import type { StopSelection } from '../../route-planning';
import { ResolvingStatus, resolvingToneClass } from '../../stop-order';
import { type TrapOrdinalTone, trapStopBadgeTone } from './trap-route-data';

const TrapIcon = iconRegistry.entities.trap.icon;

/**
 * The read-only stop list on the Trap Route detail page. Traps are one stop
 * each, with no clustering, so the run reads as a flat list. Hovering or
 * selecting a stop drives the map through `selection`.
 *
 * Takes the stops in route order and the page's stop selection.
 */
export function TrapRouteStopList({
	stops,
	selection,
}: {
	readonly stops: readonly TrapRouteStopView[];
	readonly selection: StopSelection;
}) {
	return (
		<ScrollArea className="min-h-0 flex-1" type="auto">
			<ol className="divide-y divide-border/40">
				{stops.map((stop) => (
					<StopRow
						isSelected={stop.routeItemId === selection.selectedStopId}
						key={stop.routeItemId}
						onHover={selection.onHover}
						onSelect={selection.onSelect}
						stop={stop}
					/>
				))}
			</ol>
		</ScrollArea>
	);
}

/**
 * The ordinal circle here is larger than `OrdinalBadge` and fills an inactive
 * stop more lightly, so it keeps a class per tone of its own and reads only the
 * resolving class from the badge.
 */
const ordinalClass: Readonly<Record<TrapOrdinalTone, string>> = {
	default: 'bg-primary text-primary-foreground',
	inactive: 'bg-muted text-muted-foreground',
	resolving: resolvingToneClass,
};

function StopRow({
	stop,
	isSelected,
	onSelect,
	onHover,
}: {
	readonly stop: TrapRouteStopView;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
	readonly onHover: (id: string | null) => void;
}) {
	const tone = trapStopBadgeTone(stop);

	return (
		<li className="relative">
			<button
				aria-label={`Focus ${stop.name} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(stop.routeItemId)}
				onFocus={() => onHover(stop.routeItemId)}
				onBlur={() => onHover(null)}
				onMouseEnter={() => onHover(stop.routeItemId)}
				onMouseLeave={() => onHover(null)}
				type="button"
			/>
			{/* min-w-0 so the name can truncate; the block inherits pointer-events-none. */}
			<div className="pointer-events-none relative flex items-start gap-3 px-4 py-3">
				<span
					className={cn(
						'flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-xs tabular-nums',
						ordinalClass[tone],
					)}
					data-tone={tone}
				>
					{stop.ordinal}
				</span>
				<div className="grid min-w-0 flex-1 gap-0.5">
					<Link
						className={cn(
							recordLink({ size: 'sm' }),
							'pointer-events-auto flex w-fit max-w-full items-center gap-1.5',
						)}
						params={{ id: stop.trapId }}
						to="/adult-surveillance/traps/$id"
					>
						<TrapIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{stop.name}</span>
					</Link>
					{stop.directionsToNextItem !== null && stop.directionsToNextItem.trim().length > 0 ? (
						<span className="text-muted-foreground text-xs">
							To next: {stop.directionsToNextItem}
						</span>
					) : null}
				</div>
				<TrapStopStatus stop={stop} />
			</div>
		</li>
	);
}

/** `Loading…` while the Trap has not arrived, `Inactive` for an inactive one, nothing for an active one. */
function TrapStopStatus({ stop }: { readonly stop: TrapRouteStopView }) {
	if (stop.isResolving) {
		return <ResolvingStatus />;
	}
	return stop.isActive ? null : (
		<Badge tone="neutral" variant="outline">
			Inactive
		</Badge>
	);
}
