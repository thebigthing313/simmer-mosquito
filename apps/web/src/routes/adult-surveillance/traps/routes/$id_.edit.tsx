import type { RouteItemRow, TrapRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import { useCollectionRows } from '../../../../hooks/use-collection-rows';
import { webCollections } from '../../../../sync/webCollections';
import { TrapPicker } from '../../-adult-pickers';
import { type RouteStopView, useRouteStops, useTrapRoutes } from './-trap-route-data';
import { TrapRouteMap } from './-trap-route-map';

const RouteIcon = iconRegistry.entities.route.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

type MutableRouteItemRow = { -readonly [K in keyof RouteItemRow]: RouteItemRow[K] };

export const Route = createFileRoute('/adult-surveillance/traps/routes/$id_/edit')({
	component: EditTrapRouteRoute,
});

function EditTrapRouteRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { routes, isReady } = useTrapRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, features, itemCount, isLoading } = useRouteStops(id);
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const navigate = useNavigate();

	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	const onRoute = useMemo(() => new Set(stops.map((stop) => stop.trapId)), [stops]);
	const availableTraps = useMemo(
		() => traps.filter((trap) => !onRoute.has(trap.id)),
		[traps, onRoute],
	);

	const renameRoute = useCallback(
		(name: string) => {
			const trimmed = name.trim();
			if (route === null || trimmed.length === 0 || trimmed === route.routeName) {
				return;
			}
			void webCollections.routes.update(id, (draft) => {
				(draft as { -readonly [K in keyof typeof draft]: (typeof draft)[K] }).routeName = trimmed;
			});
		},
		[id, route],
	);

	const addStop = useCallback(
		(trap: TrapRow | null) => {
			if (trap === null || route === null) {
				return;
			}
			setError(null);
			const maxPosition = stops.reduce((max, stop) => Math.max(max, stop.position), 0);
			const now = new Date().toISOString();
			const row: RouteItemRow = {
				id: crypto.randomUUID(),
				organizationId: route.organizationId,
				routeId: id,
				entityType: 'trap',
				entityId: trap.id,
				position: maxPosition + 1,
				directionsToNextItem: null,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};
			try {
				void webCollections.routeItems.insert(row);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Unable to add the stop.');
			}
		},
		[id, route, stops, actorProfileId],
	);

	// Reorder by swapping the two adjacent items' stored positions.
	const move = useCallback(
		(index: number, direction: -1 | 1) => {
			const current = stops[index];
			const neighbor = stops[index + direction];
			if (current === undefined || neighbor === undefined) {
				return;
			}
			setError(null);
			try {
				void webCollections.routeItems.update(current.routeItemId, (draft) => {
					(draft as MutableRouteItemRow).position = neighbor.position;
				});
				void webCollections.routeItems.update(neighbor.routeItemId, (draft) => {
					(draft as MutableRouteItemRow).position = current.position;
				});
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Unable to reorder the route.');
			}
		},
		[stops],
	);

	const setDirections = useCallback((routeItemId: string, value: string) => {
		const next = value.trim().length === 0 ? null : value.trim();
		void webCollections.routeItems.update(routeItemId, (draft) => {
			(draft as MutableRouteItemRow).directionsToNextItem = next;
		});
	}, []);

	const removeStop = useCallback((routeItemId: string) => {
		void webCollections.routeItems.delete(routeItemId);
	}, []);

	const deleteRoute = useCallback(async () => {
		setConfirmDelete(false);
		try {
			await webCollections.routes.delete(id).isPersisted.promise;
			await navigate({ to: '/adult-surveillance/traps/routes' });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to delete the route.');
		}
	}, [id, navigate]);

	if (isReady && route === null) {
		return <RouteNotFound />;
	}

	return (
		<>
			<MapSplitPage
				map={
					<TrapRouteMap
						features={features}
						fitKey={id}
						highlightId={highlightId}
						onHoverStop={setHighlightId}
						stops={stops}
					/>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
						<button
							className="inline-flex w-fit items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() =>
								void navigate({ to: '/adult-surveillance/traps/routes/$id', params: { id } })
							}
							type="button"
						>
							<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
							Back to route
						</button>

						<div className="flex items-center gap-2">
							<RouteIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
							<Input
								aria-label="Route name"
								className="font-medium"
								defaultValue={route?.routeName ?? ''}
								key={route?.id ?? 'route'}
								onBlur={(event) => renameRoute(event.target.value)}
								placeholder="Route name"
							/>
						</div>
						<p className="text-muted-foreground text-xs">{stopCountLabel(itemCount)}</p>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto">
						<div className="grid gap-4 p-4">
							{error !== null ? (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							) : null}

							<div className="grid gap-1.5">
								<span className="font-medium text-foreground text-sm">Add a stop</span>
								<TrapPicker onSelect={addStop} traps={availableTraps} value={null} />
							</div>

							<StopEditor
								isLoading={isLoading}
								onMove={move}
								onRemove={removeStop}
								onSetDirections={setDirections}
								stops={stops}
							/>

							<div className="border-border/50 border-t pt-4">
								<Button
									onClick={() => setConfirmDelete(true)}
									size="sm"
									type="button"
									variant="ghost"
								>
									<DeleteIcon aria-hidden="true" />
									Delete route
								</Button>
							</div>
						</div>
					</div>
				</div>
			</MapSplitPage>

			<AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this route?</AlertDialogTitle>
						<AlertDialogDescription>
							{route?.routeName} and its {itemCount === 1 ? 'stop' : 'stops'} will be removed. The
							traps themselves aren't deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void deleteRoute()}>Delete route</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function StopEditor({
	stops,
	isLoading,
	onMove,
	onRemove,
	onSetDirections,
}: {
	readonly stops: readonly RouteStopView[];
	readonly isLoading: boolean;
	readonly onMove: (index: number, direction: -1 | 1) => void;
	readonly onRemove: (routeItemId: string) => void;
	readonly onSetDirections: (routeItemId: string, value: string) => void;
}) {
	if (isLoading && stops.length === 0) {
		return (
			<div className="grid gap-2">
				{['sk-1', 'sk-2', 'sk-3'].map((key) => (
					<div className="h-16 animate-pulse rounded-lg bg-muted/60" key={key} />
				))}
			</div>
		);
	}

	if (stops.length === 0) {
		return (
			<Empty className="min-h-[160px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>No stops yet</EmptyTitle>
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
						<span
							className={cn(
								'flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-xs tabular-nums',
								stop.isActive
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground',
							)}
						>
							{stop.ordinal}
						</span>
						<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
							{stop.name}
						</span>
						<div className="flex shrink-0 items-center gap-1">
							<Button
								aria-label="Move up"
								disabled={index === 0}
								onClick={() => onMove(index, -1)}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<ChevronUpIcon aria-hidden="true" className="size-4" />
							</Button>
							<Button
								aria-label="Move down"
								disabled={index === stops.length - 1}
								onClick={() => onMove(index, 1)}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<ChevronDownIcon aria-hidden="true" className="size-4" />
							</Button>
							<Button
								aria-label="Remove stop"
								className="text-muted-foreground hover:text-destructive"
								onClick={() => onRemove(stop.routeItemId)}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<DeleteIcon aria-hidden="true" className="size-4" />
							</Button>
						</div>
					</div>
					{index < stops.length - 1 ? (
						<Input
							aria-label={`Directions from ${stop.name} to the next stop`}
							className="h-8 text-xs"
							defaultValue={stop.directionsToNextItem ?? ''}
							key={stop.routeItemId}
							onBlur={(event) => onSetDirections(stop.routeItemId, event.target.value)}
							placeholder="Directions to the next stop (optional)"
						/>
					) : null}
				</li>
			))}
		</ol>
	);
}

function RouteNotFound() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Route not found</EmptyTitle>
					<EmptyDescription>
						This route may have been deleted, or the link is out of date.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}

function stopCountLabel(count: number): string {
	return count === 1 ? '1 stop' : `${count} stops`;
}
