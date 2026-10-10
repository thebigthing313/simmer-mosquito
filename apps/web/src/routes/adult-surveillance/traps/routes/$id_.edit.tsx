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
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { TrapPicker } from '../../../../components/adult-surveillance/adult-pickers';
import { trapStopTone } from '../../../../components/adult-surveillance/traps/trap-route-data';
import { TrapRouteStopEditor } from '../../../../components/adult-surveillance/traps/trap-route-stop-editor';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import { StopSequenceMap } from '../../../../components/map/stop-sequence-map';
import { EditFormSkeleton, RecordEditFrame } from '../../../../components/record';
import type { MoveAction, MovePlan } from '../../../../components/stop-order';
import {
	type TrapRouteStopView,
	useTrapRouteStops,
} from '../../../../hooks/adult-surveillance/use-trap-route-stops';
import { useTrapRoutes } from '../../../../hooks/adult-surveillance/use-trap-routes';
import type { RouteStopFeature } from '../../../../hooks/map/use-route-layer';
import { useRouteItemMutations } from '../../../../hooks/mutations/use-route-item-mutations';
import { useRouteMutations } from '../../../../hooks/mutations/use-route-mutations';
import { type TrapListing, useActiveTraps } from '../../../../hooks/queries/use-active-traps';
import { useStopOrder } from '../../../../hooks/stop-order/use-stop-order';
import { stopCountPhrase } from '../../../../lib/format-count';
import { errorMessageForSave } from '../../../../lib/save-error';
import { isBelowWriteFloor } from '../../../../lib/write-surfaces';

const RouteIcon = iconRegistry.entities.route.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

const stopKey = (stop: TrapRouteStopView) => stop.routeItemId;

export const Route = createFileRoute('/adult-surveillance/traps/routes/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/adult-surveillance/traps/routes/$id/edit')) {
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
	const { routes, isReady, isError } = useTrapRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, itemCount, isLoading } = useTrapRouteStops(id);
	const { traps } = useActiveTraps();
	const navigate = useNavigate();

	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const { rename, remove: removeRoute, moveStops, canWrite: canWriteRoute } = useRouteMutations();
	const {
		addStop: addRouteItem,
		setDirections,
		removeStop,
		canWrite: canWriteStops,
	} = useRouteItemMutations();
	// No single submit: every control on this page writes as it is used, so each
	// one reads this. Both hooks publish `canAttributeWrite` over the snapshot,
	// and both are read because the page writes through both (#944).
	const canSubmit = canWriteRoute && canWriteStops;

	const commitMove = (plan: MovePlan) => moveStops(id, plan);
	const { ordered: orderedStops, move: moveStop } = useStopOrder({
		items: stops,
		keyOf: stopKey,
		commit: commitMove,
	});

	// Numbered off the displayed order, so the map renumbers with the list while a
	// move is still in flight rather than showing the last synced sequence.
	// A resolving stop has no location either, so skipping it changes nothing on
	// the map; testing `isResolving` is what lets the tone read `isActive`.
	const features: readonly RouteStopFeature[] = orderedStops.flatMap((stop, index) =>
		stop.isResolving || !stop.hasLocation
			? []
			: [
					{
						id: stop.routeItemId,
						lat: stop.lat as number,
						lng: stop.lng as number,
						ordinal: index + 1,
						tone: trapStopTone(stop),
					},
				],
	);

	const onRoute = new Set(stops.map((stop) => stop.trapId));
	const availableTraps = traps.filter((trap) => !onRoute.has(trap.id));

	const addStop = (trap: TrapListing | null) => {
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
			setError(errorMessageForSave(cause, 'Unable to add the stop.'));
		}
	};

	const move = async (index: number, action: MoveAction) => {
		setError(null);
		try {
			await moveStop(index, action);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to reorder the route.'));
		}
	};

	const deleteRoute = async () => {
		setConfirmDelete(false);
		try {
			await removeRoute(id);
			await navigate({ to: '/adult-surveillance/traps/routes' });
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to delete the route.'));
		}
	};

	const body = (
		<>
			<MapSplitPage
				map={
					<StopSequenceMap
						features={features}
						fitKey={id}
						highlightId={highlightId}
						onHoverStop={setHighlightId}
						recordType="route"
						stopCount={itemCount}
					/>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<RouteHeader
						canSubmit={canSubmit}
						itemCount={itemCount}
						onBack={() =>
							void navigate({ to: '/adult-surveillance/traps/routes/$id', params: { id } })
						}
						onRename={(name) => void rename(id, name)}
						route={route}
					/>

					<ScrollArea className="min-h-0 flex-1" type="auto">
						<div className="grid gap-4 p-4">
							{error !== null ? (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							) : null}

							{canSubmit ? (
								<div className="grid gap-1.5">
									<span className="font-medium text-foreground text-sm">Add a stop</span>
									<TrapPicker onSelect={addStop} traps={availableTraps} value={null} />
								</div>
							) : null}

							<TrapRouteStopEditor
								canSubmit={canSubmit}
								isLoading={isLoading}
								onMove={move}
								onRemove={removeStop}
								onSetDirections={setDirections}
								stops={orderedStops}
							/>

							<div className="border-border/50 border-t pt-4">
								<Button
									disabled={!canSubmit}
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
					</ScrollArea>
				</div>
			</MapSplitPage>

			<DeleteRouteDialog
				itemCount={itemCount}
				onConfirm={() => void deleteRoute()}
				onOpenChange={setConfirmDelete}
				open={confirmDelete}
				routeName={route?.routeName ?? ''}
			/>
		</>
	);

	return (
		<RecordEditFrame
			recordType="route"
			reading={{ isError, isReady, record: route }}
			skeleton={<EditFormSkeleton rows={['h-9', 'h-16', 'h-16', 'h-16']} />}
		>
			{() => body}
		</RecordEditFrame>
	);
}

/**
 * The back link, the name and the stop count.
 *
 * The rename writes on blur, so the guard against writing nothing, or writing
 * the name the route already has, sits with the field rather than in the route
 * component, which only ever hears a name worth sending.
 */
function RouteHeader({
	route,
	itemCount,
	canSubmit,
	onBack,
	onRename,
}: {
	readonly route: { readonly id: string; readonly routeName: string } | null;
	readonly itemCount: number;
	readonly canSubmit: boolean;
	readonly onBack: () => void;
	readonly onRename: (name: string) => void;
}) {
	const renameRoute = (name: string) => {
		const trimmed = name.trim();
		if (route === null || trimmed.length === 0 || trimmed === route.routeName) {
			return;
		}
		onRename(trimmed);
	};

	return (
		<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
			<button
				className="inline-flex w-fit items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onBack}
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
					disabled={!canSubmit}
					key={route?.id ?? 'route'}
					onBlur={(event) => renameRoute(event.target.value)}
					placeholder="Route name"
				/>
			</div>
			<p className="text-muted-foreground text-xs">{stopCountPhrase(itemCount)}</p>
		</div>
	);
}

function DeleteRouteDialog({
	open,
	onOpenChange,
	routeName,
	itemCount,
	onConfirm,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly routeName: string;
	readonly itemCount: number;
	readonly onConfirm: () => void;
}) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete This Route?</AlertDialogTitle>
					<AlertDialogDescription>
						{routeName} and its {itemCount === 1 ? 'stop' : 'stops'} will be removed. The traps
						themselves aren't deleted.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>Delete Route</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
