import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { ScrollBody } from '@simmer-mosquito/ui-web/components/scroll-body';
import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
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
import {
	ArrowLeftIcon,
	iconRegistry,
	Loader2Icon,
	PlusIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useBreadcrumbLabel } from '../../../../components/app-shell';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import { RouteStopAddressDialog } from '../../../../components/larval-surveillance/habitats/route-address-dialog';
import {
	type RouteHabitat,
	type RouteStopView,
	stopTone,
	updateHabitatDescription,
} from '../../../../components/larval-surveillance/habitats/route-data';
import { EditStopRow } from '../../../../components/larval-surveillance/habitats/route-stop-edit-row';
import { StopSequenceMap } from '../../../../components/map/stop-sequence-map';
import { EditFormSkeleton, RecordEditFrame } from '../../../../components/record';
import { type MoveAction, type MovePlan, StopList } from '../../../../components/stop-order';
import { useHabitatRouteStops } from '../../../../hooks/larval-surveillance/use-habitat-route-stops';
import { useHabitatRoutes } from '../../../../hooks/larval-surveillance/use-habitat-routes';
import { useRouteHabitatSearch } from '../../../../hooks/larval-surveillance/use-route-habitat-search';
import { useStopMeta } from '../../../../hooks/larval-surveillance/use-stop-meta';
import type { RouteStopFeature } from '../../../../hooks/map/use-route-layer';
import { useRouteItemMutations } from '../../../../hooks/mutations/use-route-item-mutations';
import { useRouteMutations } from '../../../../hooks/mutations/use-route-mutations';
import type { Tag } from '../../../../hooks/queries/tag-view';
import { useStopOrder } from '../../../../hooks/stop-order/use-stop-order';
import { useAuthSnapshot } from '../../../../hooks/use-auth-snapshot';
import { useDebouncedValue } from '../../../../hooks/use-debounced-value';
import { errorMessageForSave } from '../../../../lib/save-error';
import { isBelowWriteFloor } from '../../../../lib/write-surfaces';

const RouteIcon = iconRegistry.entities.route.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

const NO_TAGS: readonly Tag[] = [];

/** Module-level so the ordering hook's identity stays stable across renders. */
const stopKey = (stop: RouteStopView) => stop.routeItemId;

export const Route = createFileRoute('/larval-surveillance/habitats/routes/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/larval-surveillance/habitats/routes/$id/edit')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/larval-surveillance/habitats/routes/$id',
			});
		}
	},
	component: RouteEditRoute,
});

function RouteEditRoute() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;

	const { routes, isReady, isError } = useHabitatRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, itemCount, isLoading } = useHabitatRouteStops(id);

	// Show the route's name in the breadcrumb trail instead of its raw id.
	useBreadcrumbLabel(id, route?.routeName ?? null);

	const [nameDraft, setNameDraft] = useState<string | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [removeTarget, setRemoveTarget] = useState<RouteStopView | null>(null);
	const [addressTarget, setAddressTarget] = useState<RouteStopView | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const organizationId = identity?.organizationId ?? null;
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

	// A resolving stop has no location either, so skipping it changes nothing on
	// the map; testing `isResolving` is what lets `stopTone` read the status.
	const features: RouteStopFeature[] = orderedStops.flatMap((stop, index) =>
		stop.isResolving || !stop.hasLocation
			? []
			: [
					{
						id: stop.routeItemId,
						lng: stop.lng as number,
						lat: stop.lat as number,
						ordinal: index + 1,
						tone: stopTone(stop),
					},
				],
	);

	const existingHabitatIds = new Set(stops.map((stop) => stop.habitatId));

	const commitName = async () => {
		if (route === null || nameDraft === null) {
			setNameDraft(null);
			return;
		}
		const trimmed = nameDraft.trim();
		if (trimmed.length === 0 || trimmed === route.routeName) {
			setNameDraft(null);
			return;
		}
		try {
			await rename(id, trimmed);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to rename the route.'));
		}
		setNameDraft(null);
	};

	const addStop = async (habitat: RouteHabitat) => {
		if (existingHabitatIds.has(habitat.id)) {
			return;
		}
		setError(null);
		try {
			await addRouteItem({
				routeId: id,
				target: { type: 'habitat', id: habitat.id },
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

	const saveDirections = async (routeItemId: string, value: string) => {
		try {
			await setDirections(routeItemId, value);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to save directions.'));
		}
	};

	const saveDescription = async (habitatId: string, value: string) => {
		try {
			// The route reads habitats from a live on-demand subset, so the edited
			// description streams back on its own — no invalidation needed.
			await updateHabitatDescription(habitatId, value.trim());
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to save the description.'));
		}
	};

	const confirmRemove = async () => {
		const target = removeTarget;
		setRemoveTarget(null);
		if (target === null) {
			return;
		}
		setError(null);
		try {
			await removeStop(target.routeItemId);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to remove the stop.'));
		}
	};

	const confirmDeleteRoute = async () => {
		setDeleteOpen(false);
		setError(null);
		try {
			await removeRoute(id);
			await navigate({ to: '/larval-surveillance/habitats/routes' });
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
						onSelectStop={setSelectedStopId}
						recordType="route"
						selectedId={selectedStopId}
						stopCount={itemCount}
					/>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="grid gap-3 border-border/50 border-b p-4">
						<div className="flex items-center justify-between gap-3">
							<Link
								className="inline-flex items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id }}
								to="/larval-surveillance/habitats/routes/$id"
							>
								<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
								Done
							</Link>
							<Button
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
								disabled={!canSubmit}
								onClick={() => setDeleteOpen(true)}
								size="sm"
								variant="ghost"
							>
								<DeleteIcon aria-hidden="true" />
								Delete Route
							</Button>
						</div>

						<div className="grid gap-1.5">
							<label className={eyebrow()} htmlFor="route-name">
								Route name
							</label>
							<div className="flex items-center gap-2">
								<RouteIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
								<Input
									className="font-medium"
									disabled={!canSubmit}
									id="route-name"
									onBlur={commitName}
									onChange={(event) => setNameDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === 'Enter') {
											event.currentTarget.blur();
										}
									}}
									placeholder="Route name"
									value={nameDraft ?? route?.routeName ?? ''}
								/>
							</div>
						</div>

						{canSubmit ? (
							<AddStopBar existingHabitatIds={existingHabitatIds} onAdd={addStop} />
						) : null}

						{error !== null ? (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						) : null}
					</div>

					<EditStopList
						canSubmit={canSubmit}
						highlightId={highlightId}
						isLoading={isLoading}
						itemCount={itemCount}
						onEditAddress={setAddressTarget}
						onHover={setHighlightId}
						onMove={move}
						onRemove={setRemoveTarget}
						onSaveDescription={saveDescription}
						onSaveDirections={saveDirections}
						onSelect={setSelectedStopId}
						selectedStopId={selectedStopId}
						stops={orderedStops}
					/>
				</div>
			</MapSplitPage>

			<AlertDialog
				onOpenChange={(open) => !open && setRemoveTarget(null)}
				open={removeTarget !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove This Stop?</AlertDialogTitle>
						<AlertDialogDescription>
							{removeTarget?.name} will be taken off this route. The habitat itself isn't deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep Stop</AlertDialogCancel>
						<AlertDialogAction onClick={confirmRemove}>Remove Stop</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete This Route?</AlertDialogTitle>
						<AlertDialogDescription>
							{route?.routeName} and its {itemCount === 1 ? 'stop' : 'stops'} will be removed. The
							habitats themselves aren't deleted. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDeleteRoute}>Delete Route</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{addressTarget !== null && organizationId !== null ? (
				<RouteStopAddressDialog
					currentAddressId={addressTarget.addressId}
					currentAddressLabel={addressTarget.addressLabel}
					habitatId={addressTarget.habitatId}
					habitatName={addressTarget.name}
					onOpenChange={(open) => !open && setAddressTarget(null)}
					open={addressTarget !== null}
				/>
			) : null}
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

function AddStopBar({
	existingHabitatIds,
	onAdd,
}: {
	readonly existingHabitatIds: ReadonlySet<string>;
	readonly onAdd: (habitat: RouteHabitat) => void;
}) {
	const [searchInput, setSearchInput] = useState('');
	const { debounced: search, settle } = useDebouncedValue(searchInput, 220);
	const { results, isFetching, isTooShort } = useRouteHabitatSearch(search);
	const open = search.trim().length >= 2;

	return (
		<div className="grid gap-1.5">
			<SearchInput
				label="Search habitats to add"
				onChange={(event) => setSearchInput(event.target.value)}
				/*
				 * The lookup keeps its previous rows while the next request is in
				 * flight, so a clear that only empties the box leaves the panel
				 * listing matches for text that has gone from the screen.
				 */
				onClear={() => {
					setSearchInput('');
					settle('');
				}}
				placeholder="Search habitats to add a stop…"
				value={searchInput}
			/>

			{isTooShort ? (
				<p className="px-1 text-muted-foreground text-xs">Type at least 2 characters to search.</p>
			) : null}

			{open ? (
				<ScrollBody
					className="rounded-lg border border-border/60 bg-card"
					gutter={false}
					height={{ cap: '16rem' }}
				>
					{isFetching && results.length === 0 ? (
						<p className="flex items-center gap-2 px-3 py-3 text-muted-foreground text-sm">
							<Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
							Searching…
						</p>
					) : results.length === 0 ? (
						<p className="px-3 py-3 text-muted-foreground text-sm">No matching habitats.</p>
					) : (
						<ul className="divide-y divide-border/40">
							{results.map((habitat) => {
								const added = existingHabitatIds.has(habitat.id);
								return (
									<li key={habitat.id}>
										<button
											className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
											disabled={added}
											onClick={() => onAdd(habitat)}
											type="button"
										>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-medium text-foreground text-sm">
													{habitat.habitatName?.trim() || 'Unnamed habitat'}
												</span>
												<span className="block truncate text-muted-foreground text-xs">
													{habitat.addressDisplayName ?? 'No address on file'}
												</span>
											</span>
											{added ? (
												<span className="shrink-0 text-muted-foreground text-xs">Added</span>
											) : (
												<PlusIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
											)}
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</ScrollBody>
			) : null}
		</div>
	);
}

function EditStopList({
	stops,
	canSubmit,
	isLoading,
	itemCount,
	selectedStopId,
	highlightId,
	onEditAddress,
	onMove,
	onRemove,
	onSaveDescription,
	onSaveDirections,
	onSelect,
	onHover,
}: {
	readonly stops: readonly RouteStopView[];
	readonly canSubmit: boolean;
	readonly isLoading: boolean;
	readonly itemCount: number;
	readonly selectedStopId: string | null;
	readonly highlightId: string | null;
	readonly onEditAddress: (stop: RouteStopView) => void;
	readonly onMove: (index: number, action: 'up' | 'down' | 'top' | 'bottom') => void;
	readonly onRemove: (stop: RouteStopView) => void;
	readonly onSaveDescription: (habitatId: string, value: string) => void;
	readonly onSaveDirections: (routeItemId: string, value: string) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	const { typeNameById, tagsByHabitatId } = useStopMeta(stops);

	return (
		<StopList
			empty={{
				title: 'No Stops Yet',
				description: 'Search habitats above and add them in the order crews should visit.',
			}}
			isEmpty={itemCount === 0}
			isLoading={isLoading}
		>
			{stops.map((stop, index) => (
				<EditStopRow
					canSubmit={canSubmit}
					count={stops.length}
					focus={{
						selected: stop.routeItemId === selectedStopId,
						highlighted: stop.routeItemId === highlightId,
						onSelect,
						onHover,
					}}
					index={index}
					key={stop.routeItemId}
					onEditAddress={onEditAddress}
					onMove={onMove}
					onRemove={onRemove}
					onSaveDescription={onSaveDescription}
					onSaveDirections={onSaveDirections}
					ordinal={index + 1}
					sameAddressAsPrev={
						index > 0 && stop.addressId !== null && stops[index - 1]?.addressId === stop.addressId
					}
					stop={stop}
					tags={tagsByHabitatId.get(stop.habitatId) ?? NO_TAGS}
					typeName={
						stop.habitatTypeId === null ? null : (typeNameById.get(stop.habitatTypeId) ?? null)
					}
				/>
			))}
		</StopList>
	);
}
