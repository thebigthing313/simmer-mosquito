import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	GripVerticalIcon,
	iconRegistry,
	PlusIcon,
	SearchIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { WriteOnly } from '../../../components/write-only';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import {
	type FilterCodecs,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { webCollections } from '../../../sync/webCollections';
import { RegionFolderDialog } from './-folder-dialog';
import { RegionMapCard } from './-region-map-card';

interface RegionFilters {
	readonly search: string;
}

const REGION_FILTER_DEFAULTS: RegionFilters = { search: '' };
const REGION_FILTER_CODECS: FilterCodecs<RegionFilters> = { search: textParam };

export const Route = createFileRoute('/gis/regions/')({
	component: RegionsExplorerRoute,
	validateSearch: searchValidator(REGION_FILTER_CODECS),
});

const RegionIcon = iconRegistry.entities.region.icon;
const ImportIcon = iconRegistry.actions.upload.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const regionsGcTimeMs = 30_000;

/** Drag payload type + a sentinel drop key for the "move out of any folder" zone. */
const REGION_DND_TYPE = 'application/x-simmer-region';
const UNFILED_DROP_KEY = '__unfiled__';

/** Shared drag-and-drop wiring threaded down to rows (sources) and folders (targets). */
interface RegionDnd {
	readonly draggingId: string | null;
	readonly dropTargetKey: string | null;
	readonly onDragStart: (id: string) => void;
	readonly onDragEnd: () => void;
	readonly onDragOverTarget: (key: string) => void;
	readonly onDropRegion: (regionId: string, folderId: string | null) => void;
}

/** Shared inline-rename state + actions threaded down to every region row. */
interface RegionRename {
	readonly renamingId: string | null;
	readonly start: (id: string) => void;
	readonly commit: (id: string, name: string) => void;
	readonly cancel: () => void;
}

function RegionsExplorerRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	const { rows: folders } = useCollectionRows<RegionFolderRow>(webCollections.regionFolders);

	const result = useLiveQuery(
		{
			gcTime: regionsGcTimeMs,
			query: (query) =>
				query
					.from({ region: webCollections.regions })
					.where(({ region }) => eq(region.organizationId, organizationId))
					.orderBy(({ region }) => region.name, 'asc'),
		},
		[organizationId],
	);
	const regions = (result.data ?? []) as readonly RegionRow[];
	// A ref keeps rename/move handlers stable while still reading the latest rows.
	const regionsRef = useRef(regions);
	regionsRef.current = regions;

	// Visibility (map) is off for every region until a checkbox turns it on.
	const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set());
	// Folders default collapsed; only explicitly-opened ones are tracked.
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
	// The search term lives in the URL, so a shared link and Back out of a region
	// both land on the list the operator had narrowed to.
	const { filters: regionQuery, setFilters: setRegionFilters } = useSearchFilters(
		REGION_FILTER_DEFAULTS,
		REGION_FILTER_CODECS,
	);
	const commitSearch = useCallback(
		(next: string) => setRegionFilters({ search: next }),
		[setRegionFilters],
	);
	const { input: search, setInput: setSearch } = useDebouncedTextFilter(
		regionQuery.search,
		commitSearch,
	);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	// Inline rename + drag-and-drop transient state.
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
	// `null` = closed; a folder row = edit it; `'new'` = create one.
	const [folderDialog, setFolderDialog] = useState<RegionFolderRow | 'new' | null>(null);

	const sortedFolders = useMemo(
		() => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
		[folders],
	);
	const regionsByFolder = useMemo(() => {
		const byFolder = new Map<string, RegionRow[]>();
		const root: RegionRow[] = [];
		for (const region of regions) {
			if (region.regionFolderId === null) {
				root.push(region);
			} else {
				const bucket = byFolder.get(region.regionFolderId);
				if (bucket === undefined) {
					byFolder.set(region.regionFolderId, [region]);
				} else {
					bucket.push(region);
				}
			}
		}
		return { byFolder, root };
	}, [regions]);

	/*
	 * Search spans both levels of the tree: a folder hit keeps all of its regions
	 * (you searched for the folder, so you want its contents), a region hit keeps
	 * just that region under its folder. Folders that end up with nothing drop out.
	 */
	const query = search.trim().toLowerCase();
	const filtered = useMemo(() => {
		const hit = (value: string | null): boolean => value?.toLowerCase().includes(query) === true;
		if (query.length === 0) {
			return {
				folders: sortedFolders.map((folder) => ({
					folder,
					regions: regionsByFolder.byFolder.get(folder.id) ?? ([] as readonly RegionRow[]),
				})),
				unfiled: regionsByFolder.root as readonly RegionRow[],
			};
		}
		const matchedFolders: { folder: RegionFolderRow; regions: readonly RegionRow[] }[] = [];
		for (const folder of sortedFolders) {
			const folderRegions = regionsByFolder.byFolder.get(folder.id) ?? [];
			const folderHit = hit(folder.name) || hit(folder.description);
			const kept = folderHit ? folderRegions : folderRegions.filter((region) => hit(region.name));
			if (folderHit || kept.length > 0) {
				matchedFolders.push({ folder, regions: kept });
			}
		}
		return {
			folders: matchedFolders,
			unfiled: regionsByFolder.root.filter((region) => hit(region.name)),
		};
	}, [query, sortedFolders, regionsByFolder]);
	const hasMatches = filtered.folders.length > 0 || filtered.unfiled.length > 0;

	const visibleArray = useMemo(() => [...visibleIds], [visibleIds]);
	const serverUrl = getServerUrl();
	const regionLayer = useMemo(
		() => ({
			serverUrl,
			visibleIds: visibleArray,
			selectedId: focusedId,
			onSelectFeature: (id: string | null) => setFocusedId(id),
		}),
		[serverUrl, visibleArray, focusedId],
	);
	const toggleRegion = useCallback((id: string, on: boolean) => {
		setVisibleIds((prev) => {
			const next = new Set(prev);
			if (on) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	}, []);

	const toggleFolder = useCallback((regionIds: readonly string[], on: boolean) => {
		setVisibleIds((prev) => {
			const next = new Set(prev);
			for (const id of regionIds) {
				if (on) {
					next.add(id);
				} else {
					next.delete(id);
				}
			}
			return next;
		});
	}, []);

	const toggleExpand = useCallback((folderId: string, open: boolean) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (open) {
				next.add(folderId);
			} else {
				next.delete(folderId);
			}
			return next;
		});
	}, []);

	// Focusing a region also switches it on, so the map has something to fly to.
	const focusRegion = useCallback((id: string) => {
		setVisibleIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
		setFocusedId(id);
	}, []);

	// Persist a rename. Name is the only field editable here, so we PATCH just it;
	// the optimistic mutation reverts to the synced name if the write fails.
	const renameRegion = useCallback(
		async (id: string, rawName: string) => {
			const name = rawName.trim();
			const current = regionsRef.current.find((region) => region.id === id);
			setRenamingId(null);
			if (current === undefined || name.length === 0 || name === current.name) {
				return;
			}
			const now = new Date().toISOString();
			try {
				await settleWrite(
					webCollections.regions.update(id, (draft) => {
						const writable = draft as { -readonly [K in keyof RegionRow]: RegionRow[K] };
						writable.name = name;
						if (actorProfileId !== null) {
							writable.updatedByProfileId = actorProfileId;
						}
						writable.updatedAt = now;
					}),
				);
			} catch {
				// Optimistic mutation rolled back; the tree already shows the synced name.
			}
		},
		[actorProfileId],
	);

	// Reassign a region's folder (null = unfiled). PATCHes only regionFolderId.
	const moveRegion = useCallback(
		async (id: string, folderId: string | null) => {
			const current = regionsRef.current.find((region) => region.id === id);
			if (current === undefined || (current.regionFolderId ?? null) === folderId) {
				return;
			}
			const now = new Date().toISOString();
			try {
				await settleWrite(
					webCollections.regions.update(id, (draft) => {
						const writable = draft as { -readonly [K in keyof RegionRow]: RegionRow[K] };
						writable.regionFolderId = folderId;
						if (actorProfileId !== null) {
							writable.updatedByProfileId = actorProfileId;
						}
						writable.updatedAt = now;
					}),
				);
			} catch {
				// Optimistic mutation rolled back; the tree already shows the prior folder.
			}
		},
		[actorProfileId],
	);

	const dnd = useMemo<RegionDnd>(
		() => ({
			draggingId,
			dropTargetKey,
			onDragStart: (id) => setDraggingId(id),
			onDragEnd: () => {
				setDraggingId(null);
				setDropTargetKey(null);
			},
			onDragOverTarget: (key) => setDropTargetKey(key),
			onDropRegion: (regionId, folderId) => {
				setDropTargetKey(null);
				void moveRegion(regionId, folderId);
			},
		}),
		[draggingId, dropTargetKey, moveRegion],
	);

	const rename = useMemo<RegionRename>(
		() => ({
			renamingId,
			start: (id) => setRenamingId(id),
			commit: (id, name) => void renameRegion(id, name),
			cancel: () => setRenamingId(null),
		}),
		[renamingId, renameRegion],
	);

	return (
		<MapSplitPage
			map={
				<>
					{/*
					 * Frame the ticked regions as the visible set changes — except while
					 * one is focused, since focusing also ticks it and the region card
					 * already frames that single boundary.
					 */}
					<MapCanvas
						contextMenu={{}}
						controls={{ layers: false, measure: true }}
						fitToData={focusedId === null}
						onMapReady={setMap}
						regionLayer={regionLayer}
					/>
					{focusedId === null ? null : (
						<RegionMapCard id={focusedId} map={map} onClose={() => setFocusedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ layout: 'stack', gap: 'tight', padding: 'default' })}>
					<div className="flex items-center justify-between gap-2">
						<h1 className="m-0 font-semibold text-foreground text-lg leading-none">Regions</h1>
						<div className="flex items-center gap-2">
							<WriteOnly minimum="manager">
								<Button onClick={() => setFolderDialog('new')} size="sm" variant="outline">
									New Folder
								</Button>
								<Button asChild size="sm" variant="outline">
									<Link to="/gis/regions/import">
										<ImportIcon aria-hidden="true" data-icon="inline-start" />
										Import
									</Link>
								</Button>
								<Button asChild size="sm">
									<Link to="/gis/regions/create">
										<PlusIcon aria-hidden="true" data-icon="inline-start" />
										Create
									</Link>
								</Button>
							</WriteOnly>
						</div>
					</div>
					<SearchInput
						aria-label="Search regions and folders"
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search regions and folders"
						value={search}
					/>
				</div>

				{!result.isReady ? (
					<RegionsSkeleton />
				) : regions.length === 0 && sortedFolders.length === 0 ? (
					<RegionsEmpty />
				) : !hasMatches ? (
					<RegionsNoMatches query={search.trim()} />
				) : (
					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{filtered.folders.map(({ folder, regions: folderRegions }) => (
							<FolderNode
								dnd={dnd}
								// A search already narrowed the tree, so show what it found.
								expanded={query.length > 0 || expandedIds.has(folder.id)}
								focusedId={focusedId}
								folder={folder}
								key={folder.id}
								onEdit={() => setFolderDialog(folder)}
								onFocusRegion={focusRegion}
								onToggleExpand={(open) => toggleExpand(folder.id, open)}
								onToggleFolder={(on) =>
									toggleFolder(
										folderRegions.map((r) => r.id),
										on,
									)
								}
								onToggleRegion={toggleRegion}
								regions={folderRegions}
								rename={rename}
								visibleIds={visibleIds}
							/>
						))}
						<UnfiledGroup
							dnd={dnd}
							focusedId={focusedId}
							onFocusRegion={focusRegion}
							onToggleRegion={toggleRegion}
							regions={filtered.unfiled}
							rename={rename}
							showHeader={sortedFolders.length > 0}
							visibleIds={visibleIds}
						/>
					</div>
				)}
			</div>
			{folderDialog === null ? null : (
				<RegionFolderDialog
					actorProfileId={actorProfileId}
					folder={folderDialog === 'new' ? null : folderDialog}
					onClose={() => setFolderDialog(null)}
					organizationId={organizationId}
				/>
			)}
		</MapSplitPage>
	);
}

/** dragover guard: accept only region drags, and signal a "move" cursor. */
function allowRegionDrop(event: React.DragEvent<HTMLElement>): boolean {
	if (!event.dataTransfer.types.includes(REGION_DND_TYPE)) {
		return false;
	}
	event.preventDefault();
	event.dataTransfer.dropEffect = 'move';
	return true;
}

function readDraggedRegionId(event: React.DragEvent<HTMLElement>): string | null {
	const id = event.dataTransfer.getData(REGION_DND_TYPE);
	return id.length > 0 ? id : null;
}

function FolderNode({
	folder,
	regions,
	expanded,
	visibleIds,
	focusedId,
	dnd,
	rename,
	onToggleExpand,
	onToggleFolder,
	onToggleRegion,
	onFocusRegion,
	onEdit,
}: {
	readonly folder: RegionFolderRow;
	readonly regions: readonly RegionRow[];
	readonly expanded: boolean;
	readonly visibleIds: ReadonlySet<string>;
	readonly focusedId: string | null;
	readonly dnd: RegionDnd;
	readonly rename: RegionRename;
	readonly onToggleExpand: (open: boolean) => void;
	readonly onToggleFolder: (on: boolean) => void;
	readonly onToggleRegion: (id: string, on: boolean) => void;
	readonly onFocusRegion: (id: string) => void;
	readonly onEdit: () => void;
}) {
	const visibleCount = regions.filter((region) => visibleIds.has(region.id)).length;
	const checkState: boolean | 'indeterminate' =
		regions.length > 0 && visibleCount === regions.length
			? true
			: visibleCount === 0
				? false
				: 'indeterminate';
	const isDropTarget = dnd.draggingId !== null && dnd.dropTargetKey === folder.id;

	return (
		<Collapsible onOpenChange={onToggleExpand} open={expanded}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: native drag-and-drop drop zone; the region edit form's folder select is the keyboard-accessible path */}
			<div
				className={cn(
					'group flex items-center gap-1.5 rounded-md px-1.5 py-1',
					isDropTarget ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/50',
				)}
				onDragOver={(event) => {
					if (allowRegionDrop(event)) {
						dnd.onDragOverTarget(folder.id);
					}
				}}
				onDrop={(event) => {
					if (!allowRegionDrop(event)) {
						return;
					}
					const id = readDraggedRegionId(event);
					if (id !== null) {
						dnd.onDropRegion(id, folder.id);
					}
				}}
			>
				<CollapsibleTrigger
					aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
					className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
					disabled={regions.length === 0}
				>
					{expanded ? (
						<ChevronDownIcon aria-hidden="true" className="size-4" />
					) : (
						<ChevronRightIcon aria-hidden="true" className="size-4" />
					)}
				</CollapsibleTrigger>
				<Checkbox
					aria-label={`Toggle all regions in ${folder.name}`}
					checked={checkState}
					disabled={regions.length === 0}
					onCheckedChange={(value) => onToggleFolder(value === true)}
				/>
				<div className="min-w-0 flex-1">
					<p className="m-0 truncate font-medium text-foreground text-sm">{folder.name}</p>
					{folder.description === null || folder.description.length === 0 ? null : (
						<p className="m-0 truncate text-muted-foreground text-xs">{folder.description}</p>
					)}
				</div>
				<Badge className="shrink-0" tone="neutral" variant="outline">
					{regions.length}
				</Badge>
				<button
					aria-label={`Edit ${folder.name}`}
					className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
					onClick={onEdit}
					title="Edit Folder"
					type="button"
				>
					<EditIcon aria-hidden="true" className="size-4" />
				</button>
			</div>
			<CollapsibleContent>
				<div className="ml-3 border-border/50 border-l pl-1.5">
					{regions.length === 0 ? (
						<p className="px-2 py-1 text-muted-foreground text-xs">
							{isDropTarget ? 'Drop to add to this folder.' : 'No regions in this folder.'}
						</p>
					) : (
						regions.map((region) => (
							<RegionTreeRow
								depth={1}
								dnd={dnd}
								isFocused={region.id === focusedId}
								isVisible={visibleIds.has(region.id)}
								key={region.id}
								onFocus={() => onFocusRegion(region.id)}
								onToggle={(on) => onToggleRegion(region.id, on)}
								region={region}
								rename={rename}
							/>
						))
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

/**
 * Root-level (folderless) regions. When folders exist, they get an "Unfiled"
 * header that doubles as a drop target for moving a region out of any folder;
 * with no folders there is nothing to move between, so the rows render bare.
 */
function UnfiledGroup({
	regions,
	showHeader,
	visibleIds,
	focusedId,
	dnd,
	rename,
	onToggleRegion,
	onFocusRegion,
}: {
	readonly regions: readonly RegionRow[];
	readonly showHeader: boolean;
	readonly visibleIds: ReadonlySet<string>;
	readonly focusedId: string | null;
	readonly dnd: RegionDnd;
	readonly rename: RegionRename;
	readonly onToggleRegion: (id: string, on: boolean) => void;
	readonly onFocusRegion: (id: string) => void;
}) {
	if (!showHeader && regions.length === 0) {
		return null;
	}

	const rows = regions.map((region) => (
		<RegionTreeRow
			depth={showHeader ? 1 : 0}
			dnd={dnd}
			isFocused={region.id === focusedId}
			isVisible={visibleIds.has(region.id)}
			key={region.id}
			onFocus={() => onFocusRegion(region.id)}
			onToggle={(on) => onToggleRegion(region.id, on)}
			region={region}
			rename={rename}
		/>
	));

	if (!showHeader) {
		return <>{rows}</>;
	}

	const isDropTarget = dnd.draggingId !== null && dnd.dropTargetKey === UNFILED_DROP_KEY;

	return (
		<div className="mt-1">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: native drag-and-drop drop zone; the region edit form's folder select is the keyboard-accessible path */}
			<div
				className={cn(
					'flex items-center gap-1.5 rounded-md px-1.5 py-1',
					isDropTarget ? 'bg-primary/10 ring-1 ring-primary/40' : null,
				)}
				onDragOver={(event) => {
					if (allowRegionDrop(event)) {
						dnd.onDragOverTarget(UNFILED_DROP_KEY);
					}
				}}
				onDrop={(event) => {
					if (!allowRegionDrop(event)) {
						return;
					}
					const id = readDraggedRegionId(event);
					if (id !== null) {
						dnd.onDropRegion(id, null);
					}
				}}
			>
				<span className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs uppercase tracking-wide">
					Unfiled
				</span>
				<Badge className="shrink-0" tone="neutral" variant="outline">
					{regions.length}
				</Badge>
			</div>
			<div className="ml-3 border-border/50 border-l pl-1.5">
				{regions.length === 0 ? (
					<p className="px-2 py-1 text-muted-foreground text-xs">
						{isDropTarget ? 'Drop to remove from its folder.' : 'No unfiled regions.'}
					</p>
				) : (
					rows
				)}
			</div>
		</div>
	);
}

function RegionTreeRow({
	region,
	isVisible,
	isFocused,
	depth,
	dnd,
	rename,
	onToggle,
	onFocus,
}: {
	readonly region: RegionRow;
	readonly isVisible: boolean;
	readonly isFocused: boolean;
	readonly depth: number;
	readonly dnd: RegionDnd;
	readonly rename: RegionRename;
	readonly onToggle: (on: boolean) => void;
	readonly onFocus: () => void;
}) {
	const isRenaming = rename.renamingId === region.id;
	const isDragging = dnd.draggingId === region.id;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: native drag-and-drop source; the region edit form's folder select is the keyboard-accessible path
		<div
			className={cn(
				'group flex items-center gap-1.5 rounded-md py-1 pr-1',
				depth === 0 ? 'pl-1' : 'pl-1.5',
				isFocused ? 'bg-primary/8' : 'hover:bg-muted/50',
				isDragging ? 'opacity-50' : null,
				isRenaming ? null : 'cursor-grab active:cursor-grabbing',
			)}
			draggable={!isRenaming}
			onDragEnd={dnd.onDragEnd}
			onDragStart={
				isRenaming
					? undefined
					: (event) => {
							event.dataTransfer.setData(REGION_DND_TYPE, region.id);
							event.dataTransfer.effectAllowed = 'move';
							dnd.onDragStart(region.id);
						}
			}
		>
			{isRenaming ? (
				<>
					<Checkbox
						aria-label={`Show ${region.name} on the map`}
						checked={isVisible}
						onCheckedChange={(value) => onToggle(value === true)}
					/>
					<RegionRenameField
						initialName={region.name}
						onCancel={rename.cancel}
						onCommit={(name) => rename.commit(region.id, name)}
					/>
				</>
			) : (
				<>
					<GripVerticalIcon
						aria-hidden="true"
						className="size-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/70"
					/>
					<Checkbox
						aria-label={`Show ${region.name} on the map`}
						checked={isVisible}
						onCheckedChange={(value) => onToggle(value === true)}
					/>
					<button
						className="min-w-0 flex-1 truncate rounded-sm text-left text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={onFocus}
						title="Show on the Map"
						type="button"
					>
						{region.name}
					</button>
					<button
						aria-label={`Rename ${region.name}`}
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
						onClick={() => rename.start(region.id)}
						title="Rename Region"
						type="button"
					>
						<EditIcon aria-hidden="true" className="size-4" />
					</button>
					<Link
						aria-label={`View details for ${region.name}`}
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						params={{ id: region.id }}
						title="View Region Details"
						to="/gis/regions/$id"
					>
						<ChevronRightIcon aria-hidden="true" className="size-4" />
					</Link>
				</>
			)}
		</div>
	);
}

/**
 * Inline text field for a quick rename. Commits on Enter or blur, cancels on
 * Escape; a settled flag guarantees exactly one of commit/cancel runs so the
 * blur that fires as the field unmounts can't double-fire.
 */
function RegionRenameField({
	initialName,
	onCommit,
	onCancel,
}: {
	readonly initialName: string;
	readonly onCommit: (name: string) => void;
	readonly onCancel: () => void;
}) {
	const [value, setValue] = useState(initialName);
	const settledRef = useRef(false);

	const commit = () => {
		if (settledRef.current) {
			return;
		}
		settledRef.current = true;
		onCommit(value);
	};
	const cancel = () => {
		if (settledRef.current) {
			return;
		}
		settledRef.current = true;
		onCancel();
	};

	return (
		<Input
			aria-label="Region name"
			autoFocus
			className="h-7 min-w-0 flex-1 text-sm"
			onBlur={commit}
			onChange={(event) => setValue(event.target.value)}
			onFocus={(event) => event.currentTarget.select()}
			onKeyDown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					commit();
				} else if (event.key === 'Escape') {
					event.preventDefault();
					cancel();
				}
			}}
			value={value}
		/>
	);
}

function RegionsSkeleton() {
	return (
		<div className="grid gap-2 p-4">
			{[0, 1, 2, 3, 4].map((index) => (
				<Skeleton className="h-9" key={index} />
			))}
		</div>
	);
}

function RegionsNoMatches({ query }: { readonly query: string }) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<SearchIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>No Matches</EmptyTitle>
					<EmptyDescription>Nothing matches “{query}”.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}

function RegionsEmpty() {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<RegionIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>No Regions Yet</EmptyTitle>
					<EmptyDescription>
						Create a region or import boundaries from a KML or GeoJSON file.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
