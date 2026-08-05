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
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ChevronRightIcon,
	iconRegistry,
	PlusIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import { WriteOnly } from '../../../../components/write-only';
import { useCanWrite } from '../../../../hooks/use-can-write';
import { RouteCreateDialog } from '../-route-create-dialog';
import { useHabitatRoutes, useRouteStopCounts, useRouteStops } from '../-route-data';
import { RouteMap } from '../-route-map';

const RouteIcon = iconRegistry.entities.route.icon;

export const Route = createFileRoute('/larval-surveillance/habitats/routes/')({
	component: RoutesIndexRoute,
});

function RoutesIndexRoute() {
	const { routes, isLoading } = useHabitatRoutes();
	const { countByRouteId, isLoading: countsLoading } = useRouteStopCounts();
	const [searchInput, setSearchInput] = useState('');
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);

	const search = searchInput.trim().toLowerCase();
	const filtered = useMemo(
		() =>
			search.length === 0
				? routes
				: routes.filter((route) => route.routeName.toLowerCase().includes(search)),
		[routes, search],
	);

	// Default to the first route; fall back if the selection filtered/deleted away.
	const effectiveRouteId =
		selectedRouteId !== null && routes.some((route) => route.id === selectedRouteId)
			? selectedRouteId
			: (routes[0]?.id ?? null);
	const selectedRoute = routes.find((route) => route.id === effectiveRouteId) ?? null;

	const { stops, features, itemCount } = useRouteStops(effectiveRouteId);

	return (
		<>
			<MapSplitPage
				map={
					<RouteMap
						features={features}
						fitKey={effectiveRouteId ?? undefined}
						highlightId={highlightId}
						onHoverStop={setHighlightId}
						onSelectStop={setSelectedStopId}
						selectedId={selectedStopId}
						stops={stops}
					>
						{selectedRoute !== null ? (
							<div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center sm:justify-start">
								<div className="pointer-events-auto w-full max-w-sm rounded-lg border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<h2 className="truncate font-semibold text-foreground text-sm leading-tight">
												{selectedRoute.routeName}
											</h2>
											<p className="text-muted-foreground text-xs">{stopCountLabel(itemCount)}</p>
										</div>
										<RouteIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
									</div>
									<div className="mt-3 flex gap-2">
										<Button asChild className="flex-1" size="sm">
											<Link
												params={{ id: selectedRoute.id }}
												to="/larval-surveillance/habitats/routes/$id"
											>
												Open route
											</Link>
										</Button>
										<WriteOnly>
											<Button asChild className="flex-1" size="sm" variant="outline">
												<Link
													params={{ id: selectedRoute.id }}
													to="/larval-surveillance/habitats/routes/$id/edit"
												>
													Edit
												</Link>
											</Button>
										</WriteOnly>
									</div>
								</div>
							</div>
						) : null}
					</RouteMap>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-baseline gap-2">
								<h1 className="font-semibold text-foreground text-lg leading-none">Routes</h1>
								<span className="text-muted-foreground text-sm">
									{routeCountLabel(routes.length)}
								</span>
							</div>
							<WriteOnly>
								<Button onClick={() => setCreateOpen(true)} size="sm">
									<PlusIcon aria-hidden="true" />
									New Route
								</Button>
							</WriteOnly>
						</div>

						{routes.length > 0 ? (
							<SearchField onChange={setSearchInput} value={searchInput} />
						) : null}
					</div>

					<RouteResults
						countByRouteId={countByRouteId}
						countsLoading={countsLoading}
						isLoading={isLoading}
						onCreate={() => setCreateOpen(true)}
						onSelect={(id) => {
							setSelectedRouteId(id);
							setSelectedStopId(null);
							setHighlightId(null);
						}}
						routes={filtered}
						selectedId={effectiveRouteId}
						totalCount={routes.length}
					/>
				</div>
			</MapSplitPage>

			<RouteCreateDialog onOpenChange={setCreateOpen} open={createOpen} />
		</>
	);
}

function RouteResults({
	routes,
	isLoading,
	selectedId,
	totalCount,
	countByRouteId,
	countsLoading,
	onSelect,
	onCreate,
}: {
	readonly routes: readonly RouteRow[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly totalCount: number;
	readonly countByRouteId: ReadonlyMap<string, number>;
	readonly countsLoading: boolean;
	readonly onSelect: (id: string) => void;
	readonly onCreate: () => void;
}) {
	const canWrite = useCanWrite();

	if (isLoading && totalCount === 0) {
		return (
			<div className="grid gap-2 p-3">
				{['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((key) => (
					<Skeleton className="h-[52px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (totalCount === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<RouteIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No Routes Yet</EmptyTitle>
						<EmptyDescription>
							Routes group habitats into an ordered run field crews can follow.
							{canWrite ? ' Create your first to start adding stops.' : null}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<WriteOnly>
							<Button onClick={onCreate}>
								<PlusIcon aria-hidden="true" />
								New Route
							</Button>
						</WriteOnly>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	if (routes.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
				<p className="font-medium text-foreground text-sm">No routes match your search</p>
				<p className="text-muted-foreground text-sm">Try a different name.</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 overflow-y-auto p-3">
			<li className="grid gap-2">
				{routes.map((route) => (
					<RouteListRow
						isSelected={route.id === selectedId}
						key={route.id}
						onSelect={onSelect}
						route={route}
						stopCount={countsLoading ? null : (countByRouteId.get(route.id) ?? 0)}
					/>
				))}
			</li>
		</ul>
	);
}

function RouteListRow({
	route,
	isSelected,
	stopCount,
	onSelect,
}: {
	readonly route: RouteRow;
	readonly isSelected: boolean;
	readonly stopCount: number | null;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<div className="relative">
			<button
				aria-label={`Preview ${route.routeName} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full rounded-lg border transition-colors',
					isSelected
						? 'border-primary/40 bg-primary/8 ring-1 ring-primary/30 ring-inset'
						: 'border-border/60 bg-card hover:bg-muted/50',
				)}
				onClick={() => onSelect(route.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-3 py-3">
				<span
					className={cn(
						'flex size-8 shrink-0 items-center justify-center rounded-md',
						isSelected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
					)}
				>
					<RouteIcon aria-hidden="true" className="size-4" />
				</span>
				{/* min-w-0 so the name can truncate; the block inherits pointer-events-none. */}
				<span className="min-w-0 flex-1">
					<Link
						className="pointer-events-auto block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						params={{ id: route.id }}
						to="/larval-surveillance/habitats/routes/$id"
					>
						{route.routeName}
					</Link>
					<span className="block text-muted-foreground text-xs">
						{stopCount === null ? '—' : stopCountLabel(stopCount)}
					</span>
				</span>
				<Button
					aria-label={`Open ${route.routeName} details`}
					asChild
					className="pointer-events-auto shrink-0 text-muted-foreground hover:text-primary"
					size="icon-sm"
					variant="ghost"
				>
					<Link params={{ id: route.id }} to="/larval-surveillance/habitats/routes/$id">
						<ChevronRightIcon aria-hidden="true" className="size-4" />
					</Link>
				</Button>
			</div>
		</div>
	);
}

function SearchField({
	value,
	onChange,
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="relative">
			<SearchIcon
				aria-hidden="true"
				className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
			/>
			<Input
				aria-label="Search routes by name"
				className="pl-9"
				onChange={(event) => onChange(event.target.value)}
				placeholder="Search routes…"
				type="search"
				value={value}
			/>
			{value.length > 0 ? (
				<button
					aria-label="Clear search"
					className="-translate-y-1/2 absolute top-1/2 right-2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => onChange('')}
					type="button"
				>
					<XIcon aria-hidden="true" className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}

function routeCountLabel(count: number): string {
	return count === 1 ? '1 route' : `${count} routes`;
}

function stopCountLabel(count: number): string {
	return count === 1 ? '1 stop' : `${count} stops`;
}
