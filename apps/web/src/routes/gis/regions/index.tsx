import { boundsFromGeoJson } from '@simmer-mosquito/mapping';
import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import {
	ChevronRightIcon,
	iconRegistry,
	PlusIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas, type RegionTileFilters } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { useRegionGeometry } from './-region-data';

export const Route = createFileRoute('/gis/regions/')({
	component: RegionsExplorerRoute,
});

const RegionIcon = iconRegistry.entities.region.icon;
const ImportIcon = iconRegistry.actions.upload.icon;
const FolderIcon = iconRegistry.entities.region.icon;

const regionsGcTimeMs = 30_000;
const ALL_FOLDERS = 'all';
const UNFILED = 'unfiled';

function RegionsExplorerRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	const { rows: folders } = useCollectionRows<RegionFolderRow>(webCollections.regionFolders);
	const folderNameById = useMemo(
		() => new Map(folders.map((folder) => [folder.id, folder.name])),
		[folders],
	);

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

	const [search, setSearch] = useState('');
	const [folderFilter, setFolderFilter] = useState<string>(ALL_FOLDERS);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);

	const tileFilters = useMemo<RegionTileFilters>(() => {
		const trimmed = search.trim();
		return {
			...(folderFilter === ALL_FOLDERS ? {} : { regionFolderId: folderFilter }),
			...(trimmed.length === 0 ? {} : { search: trimmed }),
		};
	}, [folderFilter, search]);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return regions.filter((region) => {
			if (folderFilter === UNFILED && region.regionFolderId !== null) {
				return false;
			}
			if (folderFilter !== ALL_FOLDERS && folderFilter !== UNFILED) {
				if (region.regionFolderId !== folderFilter) {
					return false;
				}
			}
			if (query.length === 0) {
				return true;
			}
			return (
				region.name.toLowerCase().includes(query) ||
				(region.description ?? '').toLowerCase().includes(query)
			);
		});
	}, [regions, search, folderFilter]);

	const selectedRegion =
		selectedId === null ? null : (regions.find((r) => r.id === selectedId) ?? null);

	const serverUrl = getServerUrl();
	const regionLayer = useMemo(
		() => ({ serverUrl, filters: tileFilters, selectedId, onSelectFeature: setSelectedId }),
		[serverUrl, tileFilters, selectedId],
	);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas controls={{ layers: false }} onMapReady={setMap} regionLayer={regionLayer} />
					{selectedRegion === null ? null : (
						<SelectedRegionCard
							map={map}
							onClose={() => setSelectedId(null)}
							region={selectedRegion}
						/>
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<div className="flex flex-wrap items-center justify-between gap-2">
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

					<div className="relative">
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							aria-label="Search regions"
							className="pl-9"
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search regions…"
							type="search"
							value={search}
						/>
					</div>

					<Select onValueChange={setFolderFilter} value={folderFilter}>
						<SelectTrigger aria-label="Filter by folder" className="w-full" size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_FOLDERS}>All folders</SelectItem>
							<SelectItem value={UNFILED}>Unfiled</SelectItem>
							{folders.map((folder) => (
								<SelectItem key={folder.id} value={folder.id}>
									{folder.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{!result.isReady ? (
					<RegionsSkeleton />
				) : filtered.length === 0 ? (
					<RegionsEmpty hasFilters={search.trim().length > 0 || folderFilter !== ALL_FOLDERS} />
				) : (
					<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
						{filtered.map((region) => (
							<RegionListItem
								folderName={
									region.regionFolderId === null
										? null
										: (folderNameById.get(region.regionFolderId) ?? 'Unknown folder')
								}
								isSelected={region.id === selectedId}
								key={region.id}
								onSelect={setSelectedId}
								region={region}
							/>
						))}
					</ul>
				)}
			</div>
		</MapSplitPage>
	);
}

function RegionListItem({
	region,
	folderName,
	isSelected,
	onSelect,
}: {
	readonly region: RegionRow;
	readonly folderName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<li className="relative">
			<button
				aria-label={`Show ${region.name} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(region.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				<span className="min-w-0 flex-1">
					<Link
						className="pointer-events-auto relative z-10 block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						params={{ id: region.id }}
						to="/gis/regions/$id"
					>
						{region.name}
					</Link>
					<span className="block truncate text-muted-foreground text-xs">
						{folderName ?? 'Unfiled'}
					</span>
				</span>
				<Link
					aria-label={`View details for ${region.name}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: region.id }}
					title="View region details"
					to="/gis/regions/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

function SelectedRegionCard({
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
				<FolderIcon aria-hidden="true" data-icon="inline-start" />
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
				<div className="h-12 animate-pulse rounded-md bg-muted/60" key={index} />
			))}
		</div>
	);
}

function RegionsEmpty({ hasFilters }: { readonly hasFilters: boolean }) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<RegionIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{hasFilters ? 'No regions match' : 'No regions yet'}</EmptyTitle>
					<EmptyDescription>
						{hasFilters
							? 'Try a different search or folder filter.'
							: 'Create a region or import boundaries from a KML or GeoJSON file.'}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
