import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
import { ArrowLeftIcon, iconRegistry, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useBreadcrumbLabel } from '../../../../components/app-shell';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import { DangerZoneCard } from '../../../../components/danger-zone-card';
import { WriteOnly } from '../../../../components/write-only';
import { webCollections } from '../../../../sync/webCollections';
import { type RouteStopView, useRouteStops, useTrapRoutes } from './-trap-route-data';
import { TrapRouteMap } from './-trap-route-map';

const RouteIcon = iconRegistry.entities.route.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const EditIcon = iconRegistry.actions.edit.icon;

export const Route = createFileRoute('/adult-surveillance/traps/routes/$id')({
	component: RouteDetailRoute,
});

function RouteDetailRoute() {
	const { id } = Route.useParams();
	const { routes, isReady } = useTrapRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, features, itemCount, isLoading } = useRouteStops(id);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);

	useBreadcrumbLabel(id, route?.routeName ?? null);

	if (isReady && route === null) {
		return <RouteNotFound />;
	}

	return (
		<MapSplitPage
			map={
				<TrapRouteMap
					features={features}
					fitKey={id}
					highlightId={highlightId}
					onHoverStop={setHighlightId}
					onSelectStop={setSelectedStopId}
					selectedId={selectedStopId}
					stops={stops}
				/>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<Link
						className="inline-flex w-fit items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						to="/adult-surveillance/traps/routes"
					>
						<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
						Trap routes
					</Link>

					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h1 className="flex items-center gap-2 font-semibold text-foreground text-lg leading-tight">
								<RouteIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
								<span className="min-w-0 truncate">{route?.routeName ?? 'Route'}</span>
							</h1>
							<p className="mt-0.5 text-muted-foreground text-sm">{stopCountLabel(itemCount)}</p>
						</div>
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link params={{ id }} to="/adult-surveillance/traps/routes/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit Route
								</Link>
							</Button>
						</WriteOnly>
					</div>
				</div>

				<RouteBody
					isLoading={isLoading}
					itemCount={itemCount}
					onHover={setHighlightId}
					onSelect={setSelectedStopId}
					routeId={id}
					selectedStopId={selectedStopId}
					stops={stops}
				/>

				{/* The divider belongs to the card, not the panel — outside `WriteOnly`
				    it would leave viewers a bordered empty strip under the stop list. */}
				{route === null ? null : (
					<WriteOnly>
						<div className="shrink-0 border-border/40 border-t p-3">
							<DangerZoneCard
								name={route.routeName}
								noun="route"
								onDelete={() => webCollections.routes.delete(route.id)}
								recordId={route.id}
								recordType="route"
								returnTo="/adult-surveillance/traps/routes"
							/>
						</div>
					</WriteOnly>
				)}
			</div>
		</MapSplitPage>
	);
}

function RouteBody({
	routeId,
	stops,
	isLoading,
	itemCount,
	selectedStopId,
	onSelect,
	onHover,
}: {
	readonly routeId: string;
	readonly stops: readonly RouteStopView[];
	readonly isLoading: boolean;
	readonly itemCount: number;
	readonly selectedStopId: string | null;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	if (isLoading && itemCount === 0) {
		return (
			<div className="grid gap-2 p-3">
				{['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'].map((key) => (
					<Skeleton className="h-[64px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (itemCount === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MapPinnedIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No Stops on This Route</EmptyTitle>
						<EmptyDescription>
							Add traps to build the run crews will follow, in the order they should visit them.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<WriteOnly>
							<Button asChild>
								<Link params={{ id: routeId }} to="/adult-surveillance/traps/routes/$id/edit">
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
		<ol className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto">
			{stops.map((stop) => (
				<StopRow
					isSelected={stop.routeItemId === selectedStopId}
					key={stop.routeItemId}
					onHover={onHover}
					onSelect={(stopId) => onSelect(stopId === selectedStopId ? null : stopId)}
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

function RouteNotFound() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<RouteIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Route Not Found</EmptyTitle>
					<EmptyDescription>
						This route may have been deleted, or the link is out of date.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button asChild variant="outline">
						<Link to="/adult-surveillance/traps/routes">
							<ArrowLeftIcon aria-hidden="true" />
							Back to Routes
						</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	);
}

function stopCountLabel(count: number): string {
	return count === 1 ? '1 stop' : `${count} stops`;
}
