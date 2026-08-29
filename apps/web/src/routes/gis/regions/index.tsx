import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { DropdownMenuItem } from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	GripVerticalIcon,
	iconRegistry,
	NewFolderIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	FilterChip,
	useExplorerPanel,
} from '../../../components/explorer';
import { MapCanvas } from '../../../components/map';
import { WriteOnly } from '../../../components/write-only';
import { useRegionMutations } from '../../../hooks/mutations/use-region-mutations';
import {
	type RegionListing,
	useRegionDirectory,
} from '../../../hooks/queries/use-region-directory';
import {
	type RegionFolderListing,
	useRegionFolders,
} from '../../../hooks/queries/use-region-folders';
import {
	type FilterCodecs,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { RegionFolderDialog } from './-folder-dialog';
import {
	isHoveredDropTarget,
	REGION_DND_TYPE,
	type RegionDnd,
	type RegionDropTarget,
	regionDropZoneProps,
	useRegionDnd,
} from './-region-dnd';
import { RegionMapCard } from './-region-map-card';
import { type RegionRename, useRegionRename } from './-region-rename';

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
const RESULT_NOUN = { one: 'region', many: 'regions' };
const ImportIcon = iconRegistry.actions.upload.icon;
const EditIcon = iconRegistry.actions.edit.icon;

/** The one control this surface filters by, and the chip that undoes it. */
function RegionFilters({
	onChange,
	onClear,
	search,
}: {
	readonly onChange: (next: string) => void;
	readonly onClear: () => void;
	readonly search: string;
}) {
	return (
		<>
			<SearchField
				label="Search regions and folders"
				onChange={onChange}
				placeholder="Search regions and folders"
				value={search}
			/>
			{search.trim().length === 0 ? null : (
				<ActiveFilterBar onClearAll={onClear}>
					<FilterChip label={`Search: ${search}`} onRemove={onClear} />
				</ActiveFilterBar>
			)}
		</>
	);
}

/** The map, and the card for whichever region is focused. */
function RegionsMap({
	focusedId,
	map,
	onMapReady,
	onSelect,
	panel,
	regionLayer,
}: {
	readonly focusedId: string | null;
	readonly map: MapboxMap | null;
	readonly onMapReady: (instance: MapboxMap) => void;
	readonly onSelect: (id: string | null) => void;
	readonly panel: ReturnType<typeof useExplorerPanel>;
	readonly regionLayer: NonNullable<Parameters<typeof MapCanvas>[0]['regionLayer']>;
}) {
	return (
		<>
			{/*
			 * Frame the ticked regions as the visible set changes, except while one is
			 * focused, since focusing also ticks it and the region card already frames
			 * that single boundary.
			 */}
			<MapCanvas
				contextMenu={{}}
				controls={{ layers: false, measure: true, readout: true }}
				fitToData={focusedId === null}
				inset={panel.inset}
				onMapReady={onMapReady}
				regionLayer={regionLayer}
				searchWidth={panel.width}
			/>
			{focusedId === null ? null : (
				<RegionMapCard
					id={focusedId}
					inset={panel.inset}
					map={map}
					onClose={() => onSelect(null)}
				/>
			)}
		</>
	);
}

/** What the tree rows do, bound once and passed down whole. */
interface RegionTreeHandlers {
	readonly onEditFolder: (folder: RegionFolderListing) => void;
	readonly onFocusRegion: (id: string) => void;
	readonly onToggleExpand: (folderId: string, open: boolean) => void;
	readonly onToggleFolder: (regionIds: readonly string[], on: boolean) => void;
	readonly onToggleRegion: (id: string, on: boolean) => void;
}

/** What the tree rows draw by: what is ticked, open, focused and being renamed. */
interface RegionTreeView {
	readonly dnd: ReturnType<typeof useRegionDnd>;
	readonly expandedIds: ReadonlySet<string>;
	readonly focusedId: string | null;
	readonly query: string;
	readonly rename: ReturnType<typeof useRegionRename>;
	readonly visibleIds: ReadonlySet<string>;
}

/**
 * The panel's body: the folders, then whatever is filed nowhere.
 *
 * Loading and the two empty readings are the frame's, which draws them around
 * this from the `isEmpty` and the copy `regionsEmptyState` resolves. See
 * {@link ExplorerResults}.
 */
function RegionTreeBody({
	filtered,
	on,
	showUnfiledHeader,
	view,
}: {
	readonly filtered: ReturnType<typeof searchTree>;
	readonly on: RegionTreeHandlers;
	readonly showUnfiledHeader: boolean;
	readonly view: RegionTreeView;
}) {
	return (
		<div className="p-2">
			{filtered.folders.map((match) => (
				<FolderBranch key={match.folder.id} match={match} on={on} view={view} />
			))}
			<UnfiledGroup
				dnd={view.dnd}
				focusedId={view.focusedId}
				onFocusRegion={on.onFocusRegion}
				onToggleRegion={on.onToggleRegion}
				regions={filtered.unfiled}
				rename={view.rename}
				showHeader={showUnfiledHeader}
				visibleIds={view.visibleIds}
			/>
		</div>
	);
}

/** One folder and its regions, with the handlers bound to that folder. */
function FolderBranch({
	match,
	on,
	view,
}: {
	readonly match: FolderMatch;
	readonly on: RegionTreeHandlers;
	readonly view: RegionTreeView;
}) {
	const { folder, regions } = match;
	return (
		<FolderNode
			dnd={view.dnd}
			// A search already narrowed the tree, so show what it found.
			expanded={view.query.length > 0 || view.expandedIds.has(folder.id)}
			focusedId={view.focusedId}
			folder={folder}
			onEdit={() => on.onEditFolder(folder)}
			onFocusRegion={on.onFocusRegion}
			onToggleExpand={(open) => on.onToggleExpand(folder.id, open)}
			onToggleFolder={(isOn) =>
				on.onToggleFolder(
					regions.map((r) => r.id),
					isOn,
				)
			}
			onToggleRegion={on.onToggleRegion}
			regions={regions}
			rename={view.rename}
			visibleIds={view.visibleIds}
		/>
	);
}

/** The same set with these ids added or removed. */
function withIds(
	set: ReadonlySet<string>,
	ids: readonly string[],
	on: boolean,
): ReadonlySet<string> {
	const next = new Set(set);
	for (const id of ids) {
		if (on) {
			next.add(id);
		} else {
			next.delete(id);
		}
	}
	return next;
}

/** The regions under each folder, and the ones filed nowhere. */
function groupByFolder(regions: readonly RegionListing[]): {
	readonly byFolder: ReadonlyMap<string, readonly RegionListing[]>;
	readonly root: readonly RegionListing[];
} {
	const byFolder = new Map<string, RegionListing[]>();
	const root: RegionListing[] = [];
	for (const region of regions) {
		if (region.folderId === null) {
			root.push(region);
			continue;
		}
		const bucket = byFolder.get(region.folderId);
		if (bucket === undefined) {
			byFolder.set(region.folderId, [region]);
		} else {
			bucket.push(region);
		}
	}
	return { byFolder, root };
}

/** One folder and whichever of its regions the search kept. */
interface FolderMatch {
	readonly folder: RegionFolderListing;
	readonly regions: readonly RegionListing[];
}

/**
 * The tree, narrowed by the search term.
 *
 * Search spans both levels: a folder hit keeps all of its regions, since you
 * searched for the folder and so want its contents, and a region hit keeps just
 * that region under its folder. Folders that end up with nothing drop out.
 */
function searchTree(
	sortedFolders: readonly RegionFolderListing[],
	grouped: ReturnType<typeof groupByFolder>,
	query: string,
): { readonly folders: readonly FolderMatch[]; readonly unfiled: readonly RegionListing[] } {
	if (query.length === 0) {
		return {
			folders: sortedFolders.map((folder) => ({
				folder,
				regions: grouped.byFolder.get(folder.id) ?? [],
			})),
			unfiled: grouped.root,
		};
	}
	const hit = (value: string | null): boolean => value?.toLowerCase().includes(query) === true;
	const matched: FolderMatch[] = [];
	for (const folder of sortedFolders) {
		const folderRegions = grouped.byFolder.get(folder.id) ?? [];
		const folderHit = hit(folder.name) || hit(folder.description);
		const kept = folderHit ? folderRegions : folderRegions.filter((region) => hit(region.name));
		if (folderHit || kept.length > 0) {
			matched.push({ folder, regions: kept });
		}
	}
	return { folders: matched, unfiled: grouped.root.filter((region) => hit(region.name)) };
}

/**
 * The two writes the tree makes in place.
 *
 * Both are guarded on the current row rather than sent blindly. Renaming a
 * region to the name it already has is a command with nothing to change, which
 * the domain refuses, and a drag that lands a region back in its own folder is
 * the same. The `null` folder means unfiled, which is why the move guard
 * compares the value rather than asking whether one arrived.
 */
function useRegionEdits(
	mutations: ReturnType<typeof useRegionMutations>,
	regionsRef: { readonly current: readonly RegionListing[] },
) {
	const renameRegion = useCallback(
		async (id: string, rawName: string) => {
			const name = rawName.trim();
			const current = regionsRef.current.find((region) => region.id === id);
			if (current === undefined || name.length === 0 || name === current.name) {
				return;
			}
			try {
				await mutations.rename(id, name);
			} catch {
				// Optimistic mutation rolled back; the tree already shows the synced name.
			}
		},
		[mutations, regionsRef],
	);
	const moveRegion = useCallback(
		async (id: string, folderId: string | null) => {
			const current = regionsRef.current.find((region) => region.id === id);
			if (current === undefined || current.folderId === folderId) {
				return;
			}
			try {
				await mutations.move(id, folderId);
			} catch {
				// Optimistic mutation rolled back; the tree already shows the prior folder.
			}
		},
		[mutations, regionsRef],
	);
	return { moveRegion, renameRegion };
}

function RegionsExplorerRoute() {
	// `region_folders` is eager but no longer preloaded at boot — it left the
	// baseline bundle with its webCollections entry — so the tree waits for both
	// halves. Drawn on the regions alone, an agency that files everything would
	// flash "No Regions Yet" for as long as the folder list took to arrive.
	const { folders, isReady: foldersReady } = useRegionFolders();
	const { regions, isReady: regionsReady } = useRegionDirectory();
	const isReady = foldersReady && regionsReady;
	const mutations = useRegionMutations();
	// A ref keeps rename/move handlers stable while still reading the latest rows.
	const regionsRef = useRef(regions);
	regionsRef.current = regions;

	// Visibility (map) is off for every region until a checkbox turns it on.
	const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set());
	// Folders default collapsed; only explicitly-opened ones are tracked.
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
	// The search term lives in the URL, so a shared link and Back out of a region
	// both land on the list the operator had narrowed to.
	const {
		filters: regionQuery,
		setFilters: setRegionFilters,
		activeCount: activeFilterCount,
	} = useSearchFilters(REGION_FILTER_DEFAULTS, REGION_FILTER_CODECS);
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
	const panel = useExplorerPanel();
	// `null` = closed; a folder row = edit it; `'new'` = create one.
	const [folderDialog, setFolderDialog] = useState<RegionFolderListing | 'new' | null>(null);

	const sortedFolders = useMemo(
		() => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
		[folders],
	);
	const regionsByFolder = useMemo(() => groupByFolder(regions), [regions]);

	const query = search.trim().toLowerCase();
	const filtered = useMemo(
		() => searchTree(sortedFolders, regionsByFolder, query),
		[query, sortedFolders, regionsByFolder],
	);
	const hasMatches = filtered.folders.length > 0 || filtered.unfiled.length > 0;
	const emptyState = regionsEmptyState({
		hasDirectory: regions.length > 0 || sortedFolders.length > 0,
		hasMatches,
		query: search.trim(),
	});

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
	const toggleRegion = useCallback(
		(id: string, on: boolean) => setVisibleIds((prev) => withIds(prev, [id], on)),
		[],
	);
	const toggleFolder = useCallback(
		(regionIds: readonly string[], on: boolean) =>
			setVisibleIds((prev) => withIds(prev, regionIds, on)),
		[],
	);
	const toggleExpand = useCallback(
		(folderId: string, open: boolean) => setExpandedIds((prev) => withIds(prev, [folderId], open)),
		[],
	);
	// Focusing a region also switches it on, so the map has something to fly to.
	const focusRegion = useCallback((id: string) => {
		setVisibleIds((prev) => withIds(prev, [id], true));
		setFocusedId(id);
	}, []);

	const { moveRegion, renameRegion } = useRegionEdits(mutations, regionsRef);

	const dnd = useRegionDnd(moveRegion);
	const rename = useRegionRename(renameRegion);
	const treeHandlers: RegionTreeHandlers = {
		onEditFolder: setFolderDialog,
		onFocusRegion: focusRegion,
		onToggleExpand: toggleExpand,
		onToggleFolder: toggleFolder,
		onToggleRegion: toggleRegion,
	};
	const treeView: RegionTreeView = { dnd, expandedIds, focusedId, query, rename, visibleIds };

	return (
		<>
			<ExplorerMapPage
				activeFilterCount={activeFilterCount}
				filters={
					<RegionFilters onChange={setSearch} onClear={() => commitSearch('')} search={search} />
				}
				/*
				 * Filing and importing sit with Create Region rather than as buttons over
				 * the tree. All three write regions, none is reached often, and a row of
				 * them across the top of a 400px panel cost two rows of the tree they act
				 * on every time the page was opened.
				 */
				menuItems={
					<WriteOnly minimum="manager">
						<DropdownMenuItem onSelect={() => setFolderDialog('new')}>
							<NewFolderIcon aria-hidden="true" />
							New Folder
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link to="/gis/regions/import">
								<ImportIcon aria-hidden="true" />
								Import Regions
							</Link>
						</DropdownMenuItem>
					</WriteOnly>
				}
				heading={{
					title: 'Regions',
					icon: RegionIcon,
					total: regions.length,
					isLoading: !isReady,
					noun: RESULT_NOUN,
					create: { to: '/gis/regions/create', label: 'Create Region', minimum: 'manager' },
				}}
				onResetFilters={() => commitSearch('')}
				map={
					<RegionsMap
						focusedId={focusedId}
						map={map}
						onMapReady={setMap}
						onSelect={setFocusedId}
						panel={panel}
						regionLayer={regionLayer}
					/>
				}
				panel={panel}
				results={{
					// A tree, not a list: folders hold regions and rows are dragged between
					// them, so this panel fills the rows slot with its own body and states
					// its emptiness. See {@link ExplorerResults}.
					body: (
						<RegionTreeBody
							filtered={filtered}
							on={treeHandlers}
							showUnfiledHeader={sortedFolders.length > 0}
							view={treeView}
						/>
					),
					...emptyState,
					// The tree's rows are a folder header and a region, not the 60px
					// record card the rail sizes its placeholders to by default.
					skeletonClassName: 'h-9',
				}}
			/>
			{folderDialog === null ? null : (
				<RegionFolderDialog
					folder={folderDialog === 'new' ? null : folderDialog}
					onClose={() => setFolderDialog(null)}
				/>
			)}
		</>
	);
}

/** Exported for the drop-zone test: the zone has to reach the rows, not just the header. */
export function FolderNode({
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
	readonly folder: RegionFolderListing;
	readonly regions: readonly RegionListing[];
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
	const dropTarget: RegionDropTarget = { kind: 'folder', folderId: folder.id };
	const isDropTarget = isHoveredDropTarget(dnd, dropTarget);

	return (
		// The drop zone wraps the folder's rows as well as its header: dropping
		// onto a region already in the folder is the same gesture, and the empty
		// folder's "drop to add" hint renders down there. Native drag-and-drop is
		// mouse-only; the region edit form's folder select is the keyboard path.
		<div
			className={cn('rounded-md', isDropTarget ? 'bg-primary/10 ring-1 ring-primary/40' : null)}
			{...regionDropZoneProps(dnd, dropTarget)}
		>
			<Collapsible onOpenChange={onToggleExpand} open={expanded}>
				<div
					className={cn(
						'group flex items-center gap-1.5 rounded-md px-1.5 py-1',
						isDropTarget ? null : 'hover:bg-muted/50',
					)}
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
		</div>
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
	readonly regions: readonly RegionListing[];
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

	const dropTarget: RegionDropTarget = { kind: 'unfiled' };
	const isDropTarget = isHoveredDropTarget(dnd, dropTarget);

	return (
		// The rows are inside the drop zone with the header, so dropping onto an
		// already-unfiled region is the same gesture as dropping onto "Unfiled".
		// Keyboard path is the region edit form's folder select, as above.
		<div
			className={cn(
				'mt-1 rounded-md',
				isDropTarget ? 'bg-primary/10 ring-1 ring-primary/40' : null,
			)}
			{...regionDropZoneProps(dnd, dropTarget)}
		>
			<div className="flex items-center gap-1.5 rounded-md px-1.5 py-1">
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
	readonly region: RegionListing;
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

/**
 * Which of the two empty readings the tree is in, and the copy for it.
 *
 * An agency that has never drawn a region and a search that matched none of
 * hundreds are both an empty panel, and the way out of them is opposite: draw
 * or import one, or clear the search. Exported so the pair is tested without
 * standing a tree up.
 *
 * Not knowing yet reads as empty here, which is what the frame wants: while the
 * two collections load the heading is still `isLoading`, and the frame draws
 * placeholder rows rather than either of these.
 */
export function regionsEmptyState(input: {
	/** The agency has at least one Region or one folder. */
	readonly hasDirectory: boolean;
	/** The search left something in the tree. */
	readonly hasMatches: boolean;
	/** What was searched for, trimmed. */
	readonly query: string;
}): {
	readonly isEmpty: boolean;
	readonly emptyTitle: string;
	readonly emptyDescription: string;
} {
	if (input.hasDirectory) {
		return {
			isEmpty: !input.hasMatches,
			emptyTitle: 'No matches',
			emptyDescription: `Nothing matches “${input.query}”.`,
		};
	}
	return {
		isEmpty: true,
		emptyTitle: 'No regions yet',
		emptyDescription: 'Create a region, or import boundaries from a KML, KMZ, or GeoJSON file.',
	};
}
