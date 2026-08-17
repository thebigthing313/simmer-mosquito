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
import { DropdownMenuItem } from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import type { RouteStopFeature } from '../../../../components/map';
import { RouteMap } from '../../../../components/route-planning';
import {
	type MoveAction,
	type MovePlan,
	OrdinalBadge,
	StopReorderControls,
	useStopOrder,
} from '../../../../components/stop-order';
import { useRouteItemMutations } from '../../../../hooks/mutations/use-route-item-mutations';
import { useRouteMutations } from '../../../../hooks/mutations/use-route-mutations';
import { type TrapListing, useActiveTraps } from '../../../../hooks/queries/use-active-traps';
import { isBelowRole } from '../../../../lib/write-access';
import { TrapPicker } from '../../-adult-pickers';
import { type RouteStopView, useRouteStops, useTrapRoutes } from './-trap-route-data';

const RouteIcon = iconRegistry.entities.route.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

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
	const { routes, isReady } = useTrapRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, itemCount, isLoading } = useRouteStops(id);
	const { traps } = useActiveTraps();
	const navigate = useNavigate();

	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const { rename, remove: removeRoute, moveStops } = useRouteMutations();
	const { addStop: addRouteItem, setDirections, removeStop } = useRouteItemMutations();

	const commitMove = useCallback((plan: MovePlan) => moveStops(id, plan), [id, moveStops]);
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
			void rename(id, trimmed);
		},
		[id, route, rename],
	);

	const addStop = useCallback(
		(trap: TrapListing | null) => {
			if (trap === null || route === null) {
				return;
			}
			setError(null);
			try {
				void addRouteItem({
					routeId: id,
					target: { type: 'trap', id: trap.id },
					position: stops.reduce((max, stop) => Math.max(max, stop.position), 0) + 1,
				});
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Unable to add the stop.');
			}
		},
		[id, route, stops, addRouteItem],
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

	const deleteRoute = useCallback(async () => {
		setConfirmDelete(false);
		try {
			await removeRoute(id);
			await navigate({ to: '/adult-surveillance/traps/routes' });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to delete the route.');
		}
	}, [id, navigate, removeRoute]);

	if (isReady && route === null) {
		return <RouteNotFound />;
	}

	return (
		<>
			<MapSplitPage
				map={
					<RouteMap
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
						<OrdinalBadge ordinal={index + 1} tone={stop.isActive ? 'default' : 'inactive'} />
						<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
							{stop.name}
						</span>
						<StopReorderControls
							extraActions={
								<DropdownMenuItem onClick={() => onRemove(stop.routeItemId)} variant="destructive">
									Remove from route
								</DropdownMenuItem>
							}
							index={index}
							isFirst={index === 0}
							isLast={index === stops.length - 1}
							onMove={onMove}
						/>
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
