import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
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
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useBreadcrumbLabel } from '../../../../components/app-shell';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import { DangerZoneCard } from '../../../../components/danger-zone-card';
import { WriteOnly } from '../../../../components/write-only';
import { webCollections } from '../../../../sync/webCollections';
import { useHabitatRoutes, useRouteStops } from '../-route-data';
import { RouteMap } from '../-route-map';
import { RouteStopList } from '../-route-stop-list';

const RouteIcon = iconRegistry.entities.route.icon;
const EditIcon = iconRegistry.actions.edit.icon;

export const Route = createFileRoute('/larval-surveillance/habitats/routes/$id')({
	component: RouteDetailRoute,
});

function RouteDetailRoute() {
	const { id } = Route.useParams();
	const { routes, isReady } = useHabitatRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, clusters, features, itemCount, isLoading } = useRouteStops(id);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);

	// Render the route's name in the breadcrumb trail instead of its raw id.
	useBreadcrumbLabel(id, route?.routeName ?? null);

	if (isReady && route === null) {
		return <RouteNotFound />;
	}

	return (
		<MapSplitPage
			map={
				<RouteMap
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
						to="/larval-surveillance/habitats/routes"
					>
						<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
						Routes
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
								<Link params={{ id }} to="/larval-surveillance/habitats/routes/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit Route
								</Link>
							</Button>
						</WriteOnly>
					</div>
				</div>

				<RouteBody
					clusters={clusters}
					isLoading={isLoading}
					itemCount={itemCount}
					onHover={setHighlightId}
					onSelect={setSelectedStopId}
					routeId={id}
					selectedStopId={selectedStopId}
				/>

				{route === null ? null : (
					<div className="shrink-0 border-border/40 border-t p-3">
						<DangerZoneCard
							name={route.routeName}
							noun="route"
							onDelete={() => webCollections.routes.delete(route.id)}
							recordId={route.id}
							recordType="route"
							returnTo="/larval-surveillance/habitats/routes"
						/>
					</div>
				)}
			</div>
		</MapSplitPage>
	);
}

function RouteBody({
	routeId,
	clusters,
	isLoading,
	itemCount,
	selectedStopId,
	onSelect,
	onHover,
}: {
	readonly routeId: string;
	readonly clusters: ReturnType<typeof useRouteStops>['clusters'];
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
							Add habitats to build the run crews will follow, in the order they should visit them.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<WriteOnly>
							<Button asChild>
								<Link params={{ id: routeId }} to="/larval-surveillance/habitats/routes/$id/edit">
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
		<div className="min-h-0 flex-1 overflow-y-auto">
			<RouteStopList
				clusters={clusters}
				onHover={onHover}
				onSelect={(stopId) => onSelect(stopId === selectedStopId ? null : stopId)}
				selectedId={selectedStopId}
			/>
		</div>
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
						<Link to="/larval-surveillance/habitats/routes">
							<ArrowLeftIcon aria-hidden="true" />
							Back to routes
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
