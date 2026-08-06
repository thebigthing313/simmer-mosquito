import type { RouteRow } from '@simmer-mosquito/sync';
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
import { Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { webCollections } from '../../sync/webCollections';
import { useBreadcrumbLabel } from '../app-shell';
import { MapSplitPage } from '../app-shell/outlet/map-split-page';
import { DangerZoneCard } from '../danger-zone-card';
import type { RouteStopFeature } from '../map';
import { WriteOnly } from '../write-only';
import { RouteMap } from './route-map';
import { type RouteStop, stopCountLabel } from './route-stop';
import type { RoutePlanningSurface } from './surface';

const RouteIcon = iconRegistry.entities.route.icon;
const EditIcon = iconRegistry.actions.edit.icon;

/** Selection and hover, shared between the map and whatever renders the stops. */
export interface StopSelection {
	readonly selectedStopId: string | null;
	/** Toggling: selecting the already-selected stop clears it. */
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}

/**
 * One route, drawn on the map beside its ordered stops.
 *
 * The stop list itself is a render prop: habitats group theirs into clusters by
 * shared location while traps list them flat, and that grouping is the only
 * part of this page the two record types genuinely disagree about.
 */
export function RouteDetailPage({
	surface,
	routeId,
	route,
	isReady,
	stops,
	features,
	itemCount,
	isLoading,
	stopList,
}: {
	readonly surface: RoutePlanningSurface;
	readonly routeId: string;
	readonly route: RouteRow | null;
	/** False while the route set is still resolving — before that, absence means nothing. */
	readonly isReady: boolean;
	readonly stops: readonly RouteStop[];
	readonly features: readonly RouteStopFeature[];
	readonly itemCount: number;
	readonly isLoading: boolean;
	readonly stopList: (selection: StopSelection) => ReactNode;
}) {
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);

	// Render the route's name in the breadcrumb trail instead of its raw id.
	useBreadcrumbLabel(routeId, route?.routeName ?? null);

	if (isReady && route === null) {
		return <RouteNotFound surface={surface} />;
	}

	return (
		<MapSplitPage
			map={
				<RouteMap
					features={features}
					fitKey={routeId}
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
						{...surface.indexLink}
					>
						<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
						{surface.title}
					</Link>

					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h1 className="flex items-center gap-2 font-semibold text-foreground text-lg leading-tight">
								<RouteIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
								<span className="min-w-0 truncate">{route?.routeName ?? 'Route'}</span>
							</h1>
							<p className="mt-0.5 text-muted-foreground text-sm">{stopCountLabel(itemCount)}</p>
						</div>
						<WriteOnly minimum="manager">
							<Button asChild size="sm" variant="outline">
								<Link {...surface.editLink(routeId)}>
									<EditIcon aria-hidden="true" />
									Edit Route
								</Link>
							</Button>
						</WriteOnly>
					</div>
				</div>

				{isLoading && itemCount === 0 ? (
					<div className="grid gap-2 p-3">
						{['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'].map((key) => (
							<Skeleton className="h-[64px] rounded-lg" key={key} />
						))}
					</div>
				) : itemCount === 0 ? (
					<NoStops routeId={routeId} surface={surface} />
				) : (
					stopList({
						selectedStopId,
						onSelect: (stopId) => setSelectedStopId(stopId === selectedStopId ? null : stopId),
						onHover: setHighlightId,
					})
				)}

				{/* The divider belongs to the card, not the panel — outside `WriteOnly`
				    it would leave viewers a bordered empty strip under the stop list. */}
				{route === null ? null : (
					<WriteOnly minimum="manager">
						<div className="shrink-0 border-border/40 border-t p-3">
							<DangerZoneCard
								name={route.routeName}
								noun="route"
								onDelete={() => webCollections.routes.delete(route.id)}
								recordId={route.id}
								recordType="route"
								returnTo={surface.indexLink.to as NonNullable<typeof surface.indexLink.to>}
							/>
						</div>
					</WriteOnly>
				)}
			</div>
		</MapSplitPage>
	);
}

function NoStops({
	surface,
	routeId,
}: {
	readonly surface: RoutePlanningSurface;
	readonly routeId: string;
}) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MapPinnedIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>No Stops on This Route</EmptyTitle>
					<EmptyDescription>
						Add {surface.stopNounPlural} to build the run crews will follow, in the order they
						should visit them.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<WriteOnly minimum="manager">
						<Button asChild>
							<Link {...surface.editLink(routeId)}>
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

function RouteNotFound({ surface }: { readonly surface: RoutePlanningSurface }) {
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
						<Link {...surface.indexLink}>
							<ArrowLeftIcon aria-hidden="true" />
							Back to {surface.title}
						</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	);
}
