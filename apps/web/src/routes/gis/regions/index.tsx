import { boundsFromGeoJson } from '@simmer-mosquito/mapping';
import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	iconRegistry,
	PlusIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { useRegionGeometry } from './-region-data';

export const Route = createFileRoute('/gis/regions/')({
	component: RegionsExplorerRoute,
});

const RegionIcon = iconRegistry.entities.region.icon;
const ImportIcon = iconRegistry.actions.upload.icon;
const regionsGcTimeMs = 30_000;

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

	// Visibility (map) is off for every region until a checkbox turns it on.
	const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set());
	// Folders default expanded; only explicitly-collapsed ones are tracked.
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);

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
	const focusedRegion =
		focusedId === null ? null : (regions.find((r) => r.id === focusedId) ?? null);

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
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (open) {
				next.delete(folderId);
			} else {
				next.add(folderId);
			}
			return next;
		});
	}, []);

	// Focusing a region also switches it on, so the map has something to fly to.
	const focusRegion = useCallback((id: string) => {
		setVisibleIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
		setFocusedId(id);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas controls={{ layers: false }} onMapReady={setMap} regionLayer={regionLayer} />
					{focusedRegion === null ? null : (
						<RegionFocusCard map={map} onClose={() => setFocusedId(null)} region={focusedRegion} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<h1 className="m-0 font-semibold text-foreground text-lg leading-none">Regions</h1>
					<div className="flex items-center gap-2">
						<NewFolderButton actorProfileId={actorProfileId} organizationId={organizationId} />
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
					</div>
				</div>

				{!result.isReady ? (
					<RegionsSkeleton />
				) : regions.length === 0 ? (
					<RegionsEmpty />
				) : (
					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{sortedFolders.map((folder) => {
							const folderRegions = regionsByFolder.byFolder.get(folder.id) ?? [];
							return (
								<FolderNode
									expanded={!collapsed.has(folder.id)}
									focusedId={focusedId}
									folder={folder}
									key={folder.id}
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
									visibleIds={visibleIds}
								/>
							);
						})}
						{regionsByFolder.root.map((region) => (
							<RegionTreeRow
								depth={0}
								isFocused={region.id === focusedId}
								isVisible={visibleIds.has(region.id)}
								key={region.id}
								onFocus={() => focusRegion(region.id)}
								onToggle={(on) => toggleRegion(region.id, on)}
								region={region}
							/>
						))}
					</div>
				)}
			</div>
		</MapSplitPage>
	);
}

function FolderNode({
	folder,
	regions,
	expanded,
	visibleIds,
	focusedId,
	onToggleExpand,
	onToggleFolder,
	onToggleRegion,
	onFocusRegion,
}: {
	readonly folder: RegionFolderRow;
	readonly regions: readonly RegionRow[];
	readonly expanded: boolean;
	readonly visibleIds: ReadonlySet<string>;
	readonly focusedId: string | null;
	readonly onToggleExpand: (open: boolean) => void;
	readonly onToggleFolder: (on: boolean) => void;
	readonly onToggleRegion: (id: string, on: boolean) => void;
	readonly onFocusRegion: (id: string) => void;
}) {
	const visibleCount = regions.filter((region) => visibleIds.has(region.id)).length;
	const checkState: boolean | 'indeterminate' =
		regions.length > 0 && visibleCount === regions.length
			? true
			: visibleCount === 0
				? false
				: 'indeterminate';

	return (
		<Collapsible onOpenChange={onToggleExpand} open={expanded}>
			<div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/50">
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
				<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
					{folder.name}
				</span>
				<Badge className="shrink-0" tone="neutral" variant="outline">
					{regions.length}
				</Badge>
			</div>
			<CollapsibleContent>
				<div className="ml-3 border-border/50 border-l pl-1.5">
					{regions.length === 0 ? (
						<p className="px-2 py-1 text-muted-foreground text-xs">No regions in this folder.</p>
					) : (
						regions.map((region) => (
							<RegionTreeRow
								depth={1}
								isFocused={region.id === focusedId}
								isVisible={visibleIds.has(region.id)}
								key={region.id}
								onFocus={() => onFocusRegion(region.id)}
								onToggle={(on) => onToggleRegion(region.id, on)}
								region={region}
							/>
						))
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function RegionTreeRow({
	region,
	isVisible,
	isFocused,
	depth,
	onToggle,
	onFocus,
}: {
	readonly region: RegionRow;
	readonly isVisible: boolean;
	readonly isFocused: boolean;
	readonly depth: number;
	readonly onToggle: (on: boolean) => void;
	readonly onFocus: () => void;
}) {
	return (
		<div
			className={cn(
				'flex items-center gap-1.5 rounded-md py-1 pr-1',
				depth === 0 ? 'pl-1.5' : 'pl-2',
				isFocused ? 'bg-primary/8' : 'hover:bg-muted/50',
			)}
		>
			<Checkbox
				aria-label={`Show ${region.name} on the map`}
				checked={isVisible}
				onCheckedChange={(value) => onToggle(value === true)}
			/>
			<button
				className="min-w-0 flex-1 truncate rounded-sm text-left text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onFocus}
				title="Show on the map"
				type="button"
			>
				{region.name}
			</button>
			<Link
				aria-label={`View details for ${region.name}`}
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: region.id }}
				title="View region details"
				to="/gis/regions/$id"
			>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</Link>
		</div>
	);
}

function RegionFocusCard({
	region,
	map,
	onClose,
}: {
	readonly region: RegionRow;
	readonly map: MapboxMap | null;
	readonly onClose: () => void;
}) {
	const geometryQuery = useRegionGeometry(region.id);
	const geojson = geometryQuery.data?.geojson ?? null;

	useEffect(() => {
		if (map === null || geojson === null) {
			return;
		}
		const bounds = boundsFromGeoJson(geojson);
		if (bounds === null) {
			return;
		}
		map.fitBounds(
			[
				[bounds.west, bounds.south],
				[bounds.east, bounds.north],
			],
			{ padding: 64, maxZoom: 15, duration: 600 },
		);
	}, [map, geojson]);

	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<article className="pointer-events-auto w-full max-w-[420px] rounded-lg border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 grid gap-0.5">
						<h2 className="truncate font-semibold text-base text-foreground leading-tight">
							{region.name}
						</h2>
						{region.description === null ? null : (
							<p className="truncate text-muted-foreground text-sm">{region.description}</p>
						)}
					</div>
					<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
						<XIcon aria-hidden="true" />
					</Button>
				</div>
				<div className="mt-3 flex justify-end">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: region.id }} to="/gis/regions/$id">
							View details
							<ChevronRightIcon aria-hidden="true" />
						</Link>
					</Button>
				</div>
			</article>
		</div>
	);
}

function NewFolderButton({
	organizationId,
	actorProfileId,
}: {
	readonly organizationId: string;
	readonly actorProfileId: string | null;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const canCreate = organizationId.length > 0 && name.trim().length > 0;

	const onCreate = useCallback(async () => {
		if (!canCreate) {
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			const now = new Date().toISOString();
			const row: RegionFolderRow = {
				id: crypto.randomUUID(),
				organizationId,
				name: name.trim(),
				description: description.trim().length === 0 ? null : description.trim(),
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};
			await webCollections.regionFolders.insert(row).isPersisted.promise;
			setName('');
			setDescription('');
			setOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to create folder.');
		} finally {
			setIsSaving(false);
		}
	}, [canCreate, organizationId, name, description, actorProfileId]);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Button onClick={() => setOpen(true)} size="sm" variant="outline">
				New folder
			</Button>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New region folder</DialogTitle>
					<DialogDescription>Group related regions under a named folder.</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="grid gap-1.5">
						<Label htmlFor="folder-name">Name</Label>
						<Input
							id="folder-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g. Districts"
							value={name}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="folder-description">Description (optional)</Label>
						<Input
							id="folder-description"
							onChange={(event) => setDescription(event.target.value)}
							placeholder="What this folder groups"
							value={description}
						/>
					</div>
					{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
				</div>
				<DialogFooter>
					<Button onClick={() => setOpen(false)} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={!canCreate || isSaving} onClick={onCreate} type="button">
						Create folder
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RegionsSkeleton() {
	return (
		<div className="grid gap-2 p-4">
			{[0, 1, 2, 3, 4].map((index) => (
				<div className="h-9 animate-pulse rounded-md bg-muted/60" key={index} />
			))}
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
					<EmptyTitle>No regions yet</EmptyTitle>
					<EmptyDescription>
						Create a region or import boundaries from a KML or GeoJSON file.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
