import type { RouteItemRow, RouteRow, TagRow } from '@simmer-mosquito/sync';
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import {
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	ChevronUpIcon,
	HomeIcon,
	iconRegistry,
	Loader2Icon,
	MapPinnedIcon,
	PlusIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBreadcrumbLabel } from '../../../../components/app-shell';
import { MapSplitPage } from '../../../../components/app-shell/outlet/map-split-page';
import type { RouteStopFeature } from '../../../../components/map';
import { useAuthSnapshot } from '../../../../hooks/use-auth-snapshot';
import { webCollections } from '../../../../sync/webCollections';
import { RouteStopAddressDialog } from '../-route-address-dialog';
import {
	type HabitatSite,
	moveRouteItems,
	type RoutePlacement,
	type RouteStopView,
	stopTone,
	updateHabitatDescription,
	useHabitatRoutes,
	useHabitatSearch,
	useRouteStops,
} from '../-route-data';
import { RouteMap } from '../-route-map';
import { OrdinalBadge, StopMetaChips, StopStatus, useStopMeta } from '../-route-stop-list';

const RouteIcon = iconRegistry.entities.route.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const MoreIcon = iconRegistry.arrows.moreHorizontal.icon;

const NO_TAGS: readonly TagRow[] = [];

type MutableRouteRow = { -readonly [Key in keyof RouteRow]: RouteRow[Key] };
type MutableRouteItemRow = { -readonly [Key in keyof RouteItemRow]: RouteItemRow[Key] };

export const Route = createFileRoute('/larval-surveillance/habitats/routes/$id_/edit')({
	component: RouteEditRoute,
});

function RouteEditRoute() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;

	const { routes, isReady } = useHabitatRoutes();
	const route = routes.find((candidate) => candidate.id === id) ?? null;
	const { stops, itemCount, isLoading } = useRouteStops(id);

	// Show the route's name in the breadcrumb trail instead of its raw id.
	useBreadcrumbLabel(id, route?.routeName ?? null);

	const [nameDraft, setNameDraft] = useState<string | null>(null);
	const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [removeTarget, setRemoveTarget] = useState<RouteStopView | null>(null);
	const [addressTarget, setAddressTarget] = useState<RouteStopView | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const organizationId = identity?.organizationId ?? null;

	// Optimistic ordering: reflect a move instantly, reconcile when sync catches up.
	const orderedStops = useMemo(() => {
		if (pendingOrder === null) {
			return stops;
		}
		const rank = new Map(pendingOrder.map((routeItemId, index) => [routeItemId, index]));
		return [...stops].sort(
			(first, second) =>
				(rank.get(first.routeItemId) ?? Number.MAX_SAFE_INTEGER) -
				(rank.get(second.routeItemId) ?? Number.MAX_SAFE_INTEGER),
		);
	}, [stops, pendingOrder]);

	useEffect(() => {
		if (pendingOrder === null) {
			return;
		}
		const current = stops.map((stop) => stop.routeItemId);
		if (
			current.length === pendingOrder.length &&
			current.every((value, index) => value === pendingOrder[index])
		) {
			setPendingOrder(null);
		}
	}, [stops, pendingOrder]);

	const features = useMemo<RouteStopFeature[]>(
		() =>
			orderedStops
				.map((stop, index) => ({ stop, ordinal: index + 1 }))
				.filter((entry) => entry.stop.hasLocation)
				.map((entry) => ({
					id: entry.stop.routeItemId,
					lng: entry.stop.lng as number,
					lat: entry.stop.lat as number,
					ordinal: entry.ordinal,
					tone: stopTone(entry.stop),
				})),
		[orderedStops],
	);

	const existingHabitatIds = useMemo(() => new Set(stops.map((stop) => stop.habitatId)), [stops]);

	const commitName = useCallback(async () => {
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
			const transaction = webCollections.routes.update(id, (draft) => {
				const mutable = draft as MutableRouteRow;
				mutable.routeName = trimmed;
				mutable.updatedAt = new Date().toISOString();
			});
			await transaction.isPersisted.promise;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to rename the route.');
		} finally {
			setNameDraft(null);
		}
	}, [route, nameDraft, id]);

	const addStop = useCallback(
		async (habitat: HabitatSite) => {
			const organizationId = identity?.organizationId ?? null;
			if (organizationId === null || existingHabitatIds.has(habitat.id)) {
				return;
			}
			setError(null);
			try {
				const now = new Date().toISOString();
				const maxPosition = stops.reduce((max, stop) => Math.max(max, stop.position), 0);
				const row: RouteItemRow = {
					id: crypto.randomUUID(),
					organizationId,
					routeId: id,
					entityType: 'habitat',
					entityId: habitat.id,
					position: maxPosition + 1,
					directionsToNextItem: null,
					createdByProfileId: identity?.profileId ?? null,
					updatedByProfileId: identity?.profileId ?? null,
					createdAt: now,
					updatedAt: now,
				};
				const transaction = webCollections.routeItems.insert(row);
				await transaction.isPersisted.promise;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Unable to add the stop.');
			}
		},
		[identity, existingHabitatIds, stops, id],
	);

	const move = useCallback(
		async (index: number, action: 'up' | 'down' | 'top' | 'bottom') => {
			const ids = orderedStops.map((stop) => stop.routeItemId);
			const plan = planMove(ids, index, action);
			if (plan === null) {
				return;
			}
			setError(null);
			setPendingOrder(plan.order);
			try {
				await moveRouteItems(id, [ids[index] as string], plan.placement);
			} catch (cause) {
				setPendingOrder(null);
				setError(cause instanceof Error ? cause.message : 'Unable to reorder the route.');
			}
		},
		[orderedStops, id],
	);

	const saveDirections = useCallback(async (routeItemId: string, value: string) => {
		const next = value.trim().length === 0 ? null : value.trim();
		try {
			const transaction = webCollections.routeItems.update(routeItemId, (draft) => {
				const mutable = draft as MutableRouteItemRow;
				mutable.directionsToNextItem = next;
				mutable.updatedAt = new Date().toISOString();
			});
			await transaction.isPersisted.promise;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to save directions.');
		}
	}, []);

	const saveDescription = useCallback(async (habitatId: string, value: string) => {
		try {
			// The route reads habitats from a live on-demand subset, so the edited
			// description streams back on its own — no invalidation needed.
			await updateHabitatDescription(habitatId, value.trim());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to save the description.');
		}
	}, []);

	const confirmRemove = useCallback(async () => {
		const target = removeTarget;
		setRemoveTarget(null);
		if (target === null) {
			return;
		}
		setError(null);
		try {
			const transaction = webCollections.routeItems.delete(target.routeItemId);
			await transaction.isPersisted.promise;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to remove the stop.');
		}
	}, [removeTarget]);

	const confirmDeleteRoute = useCallback(async () => {
		setDeleteOpen(false);
		setError(null);
		try {
			const transaction = webCollections.routes.delete(id);
			await transaction.isPersisted.promise;
			await navigate({ to: '/larval-surveillance/habitats/routes' });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to delete the route.');
		}
	}, [id, navigate]);

	if (isReady && route === null) {
		return <RouteEditNotFound />;
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
						onSelectStop={setSelectedStopId}
						selectedId={selectedStopId}
						stops={orderedStops}
					/>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="grid gap-3 border-border/50 border-b p-4">
						<div className="flex items-center justify-between gap-3">
							<Link
								className="inline-flex items-center gap-1 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id }}
								to="/larval-surveillance/habitats/routes/$id"
							>
								<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
								Done
							</Link>
							<Button
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
								onClick={() => setDeleteOpen(true)}
								size="sm"
								variant="ghost"
							>
								<DeleteIcon aria-hidden="true" />
								Delete Route
							</Button>
						</div>

						<div className="grid gap-1.5">
							<label
								className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wide"
								htmlFor="route-name"
							>
								Route name
							</label>
							<div className="flex items-center gap-2">
								<RouteIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
								<Input
									className="font-medium"
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

						<AddStopBar existingHabitatIds={existingHabitatIds} onAdd={addStop} />

						{error !== null ? (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						) : null}
					</div>

					<EditStopList
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
					actorProfileId={identity?.profileId ?? null}
					currentAddressId={addressTarget.addressId}
					currentAddressLabel={addressTarget.addressLabel}
					habitatId={addressTarget.habitatId}
					habitatName={addressTarget.name}
					onOpenChange={(open) => !open && setAddressTarget(null)}
					open={addressTarget !== null}
					organizationId={organizationId}
				/>
			) : null}
		</>
	);
}

function AddStopBar({
	existingHabitatIds,
	onAdd,
}: {
	readonly existingHabitatIds: ReadonlySet<string>;
	readonly onAdd: (habitat: HabitatSite) => void;
}) {
	const [searchInput, setSearchInput] = useState('');
	const search = useDebouncedValue(searchInput, 220);
	const { results, isFetching, isTooShort } = useHabitatSearch(search);
	const open = search.trim().length >= 2;

	return (
		<div className="grid gap-1.5">
			<div className="relative">
				<SearchIcon
					aria-hidden="true"
					className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
				/>
				<Input
					aria-label="Search habitats to add"
					className="pl-9"
					onChange={(event) => setSearchInput(event.target.value)}
					placeholder="Add a stop — search habitats…"
					type="search"
					value={searchInput}
				/>
				{searchInput.length > 0 ? (
					<button
						aria-label="Clear search"
						className="-translate-y-1/2 absolute top-1/2 right-2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => setSearchInput('')}
						type="button"
					>
						<XIcon aria-hidden="true" className="size-3.5" />
					</button>
				) : null}
			</div>

			{isTooShort ? (
				<p className="px-1 text-muted-foreground text-xs">Type at least 2 characters to search.</p>
			) : null}

			{open ? (
				<div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-card">
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
				</div>
			) : null}
		</div>
	);
}

function EditStopList({
	stops,
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

	if (isLoading && itemCount === 0) {
		return (
			<div className="grid gap-2 p-3">
				{['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((key) => (
					<div className="h-[72px] animate-pulse rounded-lg bg-muted/60" key={key} />
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
						<EmptyTitle>No Stops Yet</EmptyTitle>
						<EmptyDescription>
							Search habitats above and add them in the order crews should visit.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
			{stops.map((stop, index) => (
				<EditStopRow
					index={index}
					isFirst={index === 0}
					isHighlighted={stop.routeItemId === highlightId}
					isLast={index === stops.length - 1}
					isSelected={stop.routeItemId === selectedStopId}
					key={stop.routeItemId}
					onEditAddress={onEditAddress}
					onHover={onHover}
					onMove={onMove}
					onRemove={onRemove}
					onSaveDescription={onSaveDescription}
					onSaveDirections={onSaveDirections}
					onSelect={onSelect}
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
		</ol>
	);
}

function EditStopRow({
	stop,
	ordinal,
	index,
	isFirst,
	isLast,
	isSelected,
	isHighlighted,
	sameAddressAsPrev,
	typeName,
	tags,
	onEditAddress,
	onMove,
	onRemove,
	onSaveDescription,
	onSaveDirections,
	onSelect,
	onHover,
}: {
	readonly stop: RouteStopView;
	readonly ordinal: number;
	readonly index: number;
	readonly isFirst: boolean;
	readonly isLast: boolean;
	readonly isSelected: boolean;
	readonly isHighlighted: boolean;
	readonly sameAddressAsPrev: boolean;
	readonly typeName: string | null;
	readonly tags: readonly TagRow[];
	readonly onEditAddress: (stop: RouteStopView) => void;
	readonly onMove: (index: number, action: 'up' | 'down' | 'top' | 'bottom') => void;
	readonly onRemove: (stop: RouteStopView) => void;
	readonly onSaveDescription: (habitatId: string, value: string) => void;
	readonly onSaveDirections: (routeItemId: string, value: string) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected || isHighlighted
					? 'border-primary/40 ring-1 ring-primary/25'
					: 'border-border/60',
			)}
			onMouseEnter={() => onHover(stop.routeItemId)}
			onMouseLeave={() => onHover(null)}
		>
			{/* Full-card target selects the stop on the map; interactive bits opt back in. */}
			<button
				aria-label={`Show ${stop.name} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full rounded-lg transition-colors',
					isSelected ? 'bg-primary/5' : 'hover:bg-muted/40',
				)}
				onClick={() => onSelect(isSelected ? null : stop.routeItemId)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-start gap-3 p-3">
				<OrdinalBadge ordinal={ordinal} stop={stop} />

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<Link
							className="pointer-events-auto w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
							params={{ id: stop.habitatId }}
							to="/larval-surveillance/habitats/$id"
						>
							{stop.name}
						</Link>
						<StopStatus stop={stop} />
						<span aria-hidden="true" className="min-w-0 flex-1" />
						<div className="pointer-events-auto flex shrink-0 items-center gap-0.5">
							<Button
								aria-label="Move up"
								className="size-7"
								disabled={isFirst}
								onClick={() => onMove(index, 'up')}
								size="icon"
								variant="ghost"
							>
								<ChevronUpIcon aria-hidden="true" className="size-4" />
							</Button>
							<Button
								aria-label="Move down"
								className="size-7"
								disabled={isLast}
								onClick={() => onMove(index, 'down')}
								size="icon"
								variant="ghost"
							>
								<ChevronDownIcon aria-hidden="true" className="size-4" />
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										aria-label="More stop actions"
										className="size-7"
										size="icon"
										variant="ghost"
									>
										<MoreIcon aria-hidden="true" className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem disabled={isFirst} onClick={() => onMove(index, 'top')}>
										Move to top
									</DropdownMenuItem>
									<DropdownMenuItem disabled={isLast} onClick={() => onMove(index, 'bottom')}>
										Move to bottom
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => onEditAddress(stop)}>
										<HomeIcon aria-hidden="true" />
										Edit linked address…
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => onRemove(stop)} variant="destructive">
										Remove from route
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>

					{/* The home icon is the label; consecutive matching addresses read dimmed. */}
					<span
						className={cn(
							'mt-1 flex items-center gap-1.5 text-xs',
							sameAddressAsPrev ? 'text-muted-foreground/60' : 'text-muted-foreground',
						)}
						title={stop.addressLabel ?? undefined}
					>
						<HomeIcon aria-hidden="true" className="size-3.5 shrink-0" />
						<span className="min-w-0 truncate">{stop.addressLabel ?? '—'}</span>
					</span>

					<StopMetaChips tags={tags} typeName={typeName} />

					<div className="mt-2 grid gap-1.5">
						<InlineEditField
							ariaLabel={`Description for ${stop.name}`}
							emptyLabel="Add a description"
							onSave={(value) => onSaveDescription(stop.habitatId, value)}
							renderValue={(value) => (
								<span className="block whitespace-pre-wrap text-foreground/80 text-xs leading-snug">
									{value}
								</span>
							)}
							textareaPlaceholder="What crews should know about this site…"
							value={stop.description}
						/>
						<InlineEditField
							ariaLabel={`Directions after ${stop.name}`}
							emptyLabel="Add directions to the next stop"
							onSave={(value) => onSaveDirections(stop.routeItemId, value)}
							renderValue={(value) => (
								<span className="flex items-start gap-1.5 text-muted-foreground text-xs">
									<ChevronRightIcon
										aria-hidden="true"
										className="mt-px size-3 shrink-0 rotate-90 text-muted-foreground/70"
									/>
									<span className="min-w-0 whitespace-pre-wrap">{value}</span>
								</span>
							)}
							textareaPlaceholder="e.g. Turn left at the pump station; gate code 4821."
							value={stop.directionsToNextItem ?? ''}
						/>
					</div>
				</div>
			</div>
		</li>
	);
}

/**
 * A read view that turns into a textarea with explicit Save / Cancel when clicked.
 * Keeps its draft aligned with synced changes while idle; Escape cancels, ⌘/Ctrl+Enter saves.
 */
function InlineEditField({
	value,
	ariaLabel,
	emptyLabel,
	textareaPlaceholder,
	onSave,
	renderValue,
}: {
	readonly value: string;
	readonly ariaLabel: string;
	readonly emptyLabel: string;
	readonly textareaPlaceholder: string;
	readonly onSave: (value: string) => void;
	readonly renderValue: (value: string) => ReactNode;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (!editing) {
			setDraft(value);
		}
	}, [value, editing]);

	useEffect(() => {
		if (!editing) {
			return;
		}
		const node = textareaRef.current;
		if (node !== null) {
			node.focus();
			node.setSelectionRange(node.value.length, node.value.length);
		}
	}, [editing]);

	const save = () => {
		setEditing(false);
		if (draft !== value) {
			onSave(draft);
		}
	};
	const cancel = () => {
		setDraft(value);
		setEditing(false);
	};

	if (editing) {
		return (
			<div className="pointer-events-auto grid gap-1.5">
				<Textarea
					aria-label={ariaLabel}
					className="min-h-[64px] text-sm"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							cancel();
						} else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							save();
						}
					}}
					placeholder={textareaPlaceholder}
					ref={textareaRef}
					value={draft}
				/>
				<div className="flex items-center gap-2">
					<Button onClick={save} size="sm" type="button">
						Save
					</Button>
					<Button onClick={cancel} size="sm" type="button" variant="ghost">
						Cancel
					</Button>
				</div>
			</div>
		);
	}

	return (
		<button
			className="-mx-1 pointer-events-auto block w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => setEditing(true)}
			type="button"
		>
			{value.trim().length > 0 ? (
				renderValue(value)
			) : (
				<span className="text-muted-foreground/60 text-xs italic">{emptyLabel}</span>
			)}
		</button>
	);
}

function RouteEditNotFound() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<RouteIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Route Not Found</EmptyTitle>
					<EmptyDescription>This route may have been deleted.</EmptyDescription>
				</EmptyHeader>
				<Link
					className="mt-2 inline-flex items-center gap-1 text-primary text-sm hover:underline"
					to="/larval-surveillance/habitats/routes"
				>
					<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
					Back to routes
				</Link>
			</Empty>
		</div>
	);
}

/** Compute the new id order + the server placement for a single-item move. */
function planMove(
	ids: readonly string[],
	index: number,
	action: 'up' | 'down' | 'top' | 'bottom',
): { readonly order: string[]; readonly placement: RoutePlacement } | null {
	const moved = ids[index];
	if (moved === undefined) {
		return null;
	}
	const rest = ids.filter((_, position) => position !== index);

	switch (action) {
		case 'up': {
			if (index === 0) {
				return null;
			}
			const anchor = ids[index - 1] as string;
			const order = [...ids];
			order.splice(index, 1);
			order.splice(index - 1, 0, moved);
			return { order, placement: { kind: 'before', routeItemId: anchor } };
		}
		case 'down': {
			if (index >= ids.length - 1) {
				return null;
			}
			const anchor = ids[index + 1] as string;
			const order = [...ids];
			order.splice(index, 1);
			order.splice(index + 1, 0, moved);
			return { order, placement: { kind: 'after', routeItemId: anchor } };
		}
		case 'top': {
			if (index === 0) {
				return null;
			}
			return { order: [moved, ...rest], placement: { kind: 'start' } };
		}
		case 'bottom': {
			if (index >= ids.length - 1) {
				return null;
			}
			return { order: [...rest, moved], placement: { kind: 'end' } };
		}
		default:
			return null;
	}
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(handle);
	}, [value, delayMs]);
	return debounced;
}
