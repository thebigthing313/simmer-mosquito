import type { RouteItemRow, TrapRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
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
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import {
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import type { RouteStopFeature } from '../../../../components/map';
import {
	type MoveAction,
	type OrderPlacement,
	useStopOrder,
} from '../../../../components/stop-order';
import { useCollectionRows } from '../../../../hooks/use-collection-rows';
import { isBelowRole } from '../../../../lib/write-access';
import { moveRouteItems } from '../../../../sync/move-route-items';
import { settleWrite } from '../../../../sync/settle-write';
import { webCollections } from '../../../../sync/webCollections';
import { TrapPicker } from '../../-adult-pickers';
import { type RouteStopView, useRouteStops, useTrapRoutes } from './-trap-route-data';
import { TrapRouteMap } from './-trap-route-map';

const RouteIcon = iconRegistry.entities.route.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

type MutableRouteItemRow = { -readonly [K in keyof RouteItemRow]: RouteItemRow[K] };

const stopKey = (stop: RouteStopView) => stop.routeItemId;

export const Route = createFileRoute('/adult-surveillance/traps/routes/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/adult-surveillance/traps/routes/$id',
			});
		}
	},
	component: EditTrapRouteRoute,
});

function EditTrapRouteRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { routes, isReady } = useTrapRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, itemCount, isLoading } = useRouteStops(id);
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const navigate = useNavigate();

	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	const commitMove = useCallback(
		(movedIds: readonly string[], placement: OrderPlacement) =>
			moveRouteItems(id, movedIds, placement),
		[id],
	);
	const { ordered: orderedStops, move: moveStop } = useStopOrder({
		items: stops,
		keyOf: stopKey,
		commit: commitMove,
	});

	// Numbered off the displayed order, so the map renumbers with the list while a
	// move is still in flight rather than showing the last synced sequence.
	const features = useMemo<readonly RouteStopFeature[]>(
		() =>
			orderedStops
				.map((stop, index) => ({ stop, ordinal: index + 1 }))
				.filter((entry) => entry.stop.hasLocation)
				.map((entry) => ({
					id: entry.stop.routeItemId,
					lat: entry.stop.lat as number,
					lng: entry.stop.lng as number,
					ordinal: entry.ordinal,
					tone: entry.stop.isActive ? ('default' as const) : ('inactive' as const),
				})),
		[orderedStops],
	);

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

	const move = useCallback(
		async (index: number, action: MoveAction) => {
			setError(null);
			try {
				await moveStop(index, action);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Unable to reorder the route.');
			}
		},
		[moveStop],
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
			await settleWrite(webCollections.routes.delete(id));
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
					<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
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
								stops={orderedStops}
							/>

							<div className="border-border/50 border-t pt-4">
								<Button
									onClick={() => setConfirmDelete(true)}
									size="sm"
									type="button"
									variant="ghost"
								>
									<DeleteIcon aria-hidden="true" />
									Delete Route
								</Button>
							</div>
						</div>
					</div>
				</div>
			</MapSplitPage>

			<AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete This Route?</AlertDialogTitle>
						<AlertDialogDescription>
							{route?.routeName} and its {itemCount === 1 ? 'stop' : 'stops'} will be removed. The
							traps themselves aren't deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void deleteRoute()}>Delete Route</AlertDialogAction>
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
						<span
							className={cn(
								'flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-xs tabular-nums',
								stop.isActive
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground',
							)}
						>
							{index + 1}
						</span>
						<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
							{stop.name}
						</span>
						<div className="flex shrink-0 items-center gap-1">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										aria-label="Move up"
										disabled={index === 0}
										onClick={() => onMove(index, 'up')}
										size="icon-sm"
										type="button"
										variant="ghost"
									>
										<ChevronUpIcon aria-hidden="true" className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Move up one stop</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										aria-label="Move down"
										disabled={index === stops.length - 1}
										onClick={() => onMove(index, 'down')}
										size="icon-sm"
										type="button"
										variant="ghost"
									>
										<ChevronDownIcon aria-hidden="true" className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Move down one stop</TooltipContent>
							</Tooltip>
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
							placeholder="Directions to the next stop"
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
					<EmptyTitle>Route Not Found</EmptyTitle>
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
