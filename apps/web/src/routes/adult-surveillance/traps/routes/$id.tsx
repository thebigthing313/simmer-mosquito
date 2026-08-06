import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { RouteDetailPage, type StopSelection } from '../../../../components/route-planning';
import { type RouteStopView, useRouteStops, useTrapRoutes } from './-trap-route-data';
import { trapRouteSurface } from './-trap-route-surface';

const TrapIcon = iconRegistry.entities.trap.icon;

export const Route = createFileRoute('/adult-surveillance/traps/routes/$id')({
	component: RouteDetailRoute,
});

function RouteDetailRoute() {
	const { id } = Route.useParams();
	const { routes, isReady } = useTrapRoutes();
	const { stops, features, itemCount, isLoading } = useRouteStops(id);

	return (
		<RouteDetailPage
			features={features}
			isLoading={isLoading}
			isReady={isReady}
			itemCount={itemCount}
			route={routes.find((candidate) => candidate.id === id) ?? null}
			routeId={id}
			stopList={(selection) => <TrapStopList selection={selection} stops={stops} />}
			stops={stops}
			surface={trapRouteSurface}
		/>
	);
}

/** Traps are one stop each — no clustering, so the run reads as a flat list. */
function TrapStopList({
	stops,
	selection,
}: {
	readonly stops: readonly RouteStopView[];
	readonly selection: StopSelection;
}) {
	return (
		<ol className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto">
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
	);
}

function StopRow({
	stop,
	isSelected,
	onSelect,
	onHover,
}: {
	readonly stop: RouteStopView;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
	readonly onHover: (id: string | null) => void;
}) {
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
						stop.isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
					)}
				>
					{stop.ordinal}
				</span>
				<div className="grid min-w-0 flex-1 gap-0.5">
					<Link
						className="pointer-events-auto flex w-fit max-w-full items-center gap-1.5 rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
				{stop.isActive ? null : (
					<Badge tone="neutral" variant="outline">
						Inactive
					</Badge>
				)}
			</div>
		</li>
	);
}
