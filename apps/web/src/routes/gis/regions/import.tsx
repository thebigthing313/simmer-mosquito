import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { ArrowLeftIcon, iconRegistry, Loader2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { type ImportPolygon, parseRegionsFromFile } from './-import-parse';

export const Route = createFileRoute('/gis/regions/import')({
	component: ImportRegionsRoute,
});

const UploadIcon = iconRegistry.actions.upload.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const UNFILED = 'unfiled';

interface ImportItem {
	readonly id: string;
	readonly name: string;
	readonly geometry: ImportPolygon;
}

function ImportRegionsRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	const { rows: folders } = useCollectionRows<RegionFolderRow>(webCollections.regionFolders);

	const [items, setItems] = useState<readonly ImportItem[]>([]);
	const [skipped, setSkipped] = useState(0);
	const [fileName, setFileName] = useState<string | null>(null);
	const [parseError, setParseError] = useState<string | null>(null);
	const [folderId, setFolderId] = useState<string>(UNFILED);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const [importErrors, setImportErrors] = useState<readonly string[]>([]);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const canImport =
		items.length > 0 && organization !== null && actorProfileId !== null && !isImporting;

	const handleFile = useCallback(async (file: File) => {
		setParseError(null);
		setImportErrors([]);
		setSelectedId(null);
		try {
			const text = await file.text();
			const result = parseRegionsFromFile(text, file.name);
			setFileName(file.name);
			setSkipped(result.skipped);
			if (result.error !== undefined) {
				setParseError(result.error);
				setItems([]);
				return;
			}
			setItems(
				result.regions.map((region) => ({
					id: crypto.randomUUID(),
					name: region.name,
					geometry: region.geometry,
				})),
			);
		} catch (error) {
			setParseError(error instanceof Error ? error.message : 'Unable to read the file.');
			setItems([]);
		}
	}, []);

	const previewGeoJson = useMemo<GeoJSON.GeoJSON>(
		() => ({
			type: 'FeatureCollection',
			features: items.map((item, index) => ({
				type: 'Feature',
				id: index,
				properties: { name: item.name },
				geometry: item.geometry as unknown as GeoJSON.Polygon,
			})),
		}),
		[items],
	);

	const fitAll = useCallback(
		(instance: MapboxMap) => {
			setMap(instance);
			fitMapToItems(instance, items);
		},
		[items],
	);

	// Re-fit whenever the item set changes (new upload, deletion).
	const lastFitCount = useRef(0);
	if (map !== null && items.length !== lastFitCount.current) {
		lastFitCount.current = items.length;
		fitMapToItems(map, items);
	}

	const renameItem = useCallback((id: string, name: string) => {
		setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
	}, []);

	const deleteItem = useCallback((id: string) => {
		setItems((prev) => prev.filter((item) => item.id !== id));
		setSelectedId((current) => (current === id ? null : current));
	}, []);

	const selectItem = useCallback(
		(id: string | null) => {
			setSelectedId(id);
			if (id === null || map === null) {
				return;
			}
			const item = items.find((entry) => entry.id === id);
			if (item !== undefined) {
				fitMapToItems(map, [item]);
			}
		},
		[items, map],
	);

	const runImport = useCallback(async () => {
		if (organization === null || actorProfileId === null) {
			return;
		}
		setIsImporting(true);
		setImportErrors([]);
		const errors: string[] = [];
		for (const item of items) {
			try {
				const now = new Date().toISOString();
				const row: RegionRow = {
					id: crypto.randomUUID(),
					organizationId: organization.id,
					regionFolderId: folderId === UNFILED ? null : folderId,
					name: item.name.trim().length === 0 ? 'Region' : item.name.trim(),
					description: null,
					metadata: null,
					createdByProfileId: actorProfileId,
					updatedByProfileId: actorProfileId,
					createdAt: now,
					updatedAt: now,
				};
				await webCollections.regions.insert(row, { metadata: { geometry: item.geometry } })
					.isPersisted.promise;
			} catch (error) {
				errors.push(`${item.name}: ${error instanceof Error ? error.message : 'failed to import'}`);
			}
		}
		setIsImporting(false);
		if (errors.length === 0) {
			await navigate({ to: '/gis/regions' });
			return;
		}
		setImportErrors(errors);
	}, [organization, actorProfileId, items, folderId, navigate]);

	return (
		<MapSplitPage
			map={
				<MapCanvas
					controls={{ layers: false }}
					geoJson={items.length === 0 ? null : previewGeoJson}
					geoJsonInteraction={{
						onSelectFeature: (id) =>
							selectItem(id === null ? null : (items[Number(id)]?.id ?? null)),
					}}
					onMapReady={fitAll}
				/>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className="sticky top-0 z-10 grid gap-2 border-border/50 border-b bg-background/95 px-5 py-4 backdrop-blur-sm">
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						to="/gis/regions"
					>
						<ArrowLeftIcon aria-hidden="true" />
						Regions
					</Link>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
							Import regions
						</h1>
						<p className="m-0 text-muted-foreground text-sm">
							Upload a KML or GeoJSON file. Polygons are flattened into individual regions you can
							review before importing.
						</p>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<div className="grid gap-5">
						<div className="grid gap-2">
							<input
								accept=".kml,.geojson,.json,application/geo+json,application/vnd.google-earth.kml+xml"
								className="hidden"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file !== undefined) {
										void handleFile(file);
									}
									event.target.value = '';
								}}
								ref={fileInputRef}
								type="file"
							/>
							<Button onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
								<UploadIcon aria-hidden="true" data-icon="inline-start" />
								{fileName === null ? 'Choose KML or GeoJSON file' : 'Choose a different file'}
							</Button>
							{fileName === null ? null : (
								<p className="m-0 text-muted-foreground text-xs">
									{fileName} · {items.length} {items.length === 1 ? 'polygon' : 'polygons'}
									{skipped > 0 ? ` · ${skipped} non-polygon skipped` : ''}
								</p>
							)}
						</div>

						{parseError === null ? null : (
							<Alert variant="destructive">
								<AlertTitle>Couldn't read that file</AlertTitle>
								<AlertDescription>{parseError}</AlertDescription>
							</Alert>
						)}

						{items.length === 0 ? null : (
							<>
								<div className="grid gap-1.5">
									<Label htmlFor="import-folder">Import into folder</Label>
									<Select onValueChange={setFolderId} value={folderId}>
										<SelectTrigger className="w-full" id="import-folder">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={UNFILED}>Unfiled</SelectItem>
											{folders.map((folder) => (
												<SelectItem key={folder.id} value={folder.id}>
													{folder.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<span className="font-semibold text-foreground text-sm">
											Polygons to import
										</span>
										<Badge tone="neutral" variant="outline">
											{items.length}
										</Badge>
									</div>
									<ul className="grid gap-2">
										{items.map((item, index) => (
											<ImportRow
												index={index}
												isSelected={item.id === selectedId}
												item={item}
												key={item.id}
												onDelete={() => deleteItem(item.id)}
												onRename={(name) => renameItem(item.id, name)}
												onSelect={() => selectItem(item.id)}
											/>
										))}
									</ul>
								</div>

								{importErrors.length === 0 ? null : (
									<Alert variant="destructive">
										<AlertTitle>
											{importErrors.length} of {items.length} regions failed to import
										</AlertTitle>
										<AlertDescription>
											<ul className="m-0 list-disc pl-4">
												{importErrors.map((message) => (
													<li key={message}>{message}</li>
												))}
											</ul>
										</AlertDescription>
									</Alert>
								)}

								<div className="flex justify-end gap-2 border-border/50 border-t pt-5">
									<Button asChild type="button" variant="ghost">
										<Link to="/gis/regions">Cancel</Link>
									</Button>
									<Button disabled={!canImport} onClick={runImport} type="button">
										{isImporting ? (
											<Loader2Icon
												aria-hidden="true"
												className="animate-spin"
												data-icon="inline-start"
											/>
										) : null}
										Import {items.length} {items.length === 1 ? 'region' : 'regions'}
									</Button>
								</div>
							</>
						)}
					</div>
				</div>
			</div>
		</MapSplitPage>
	);
}

function ImportRow({
	item,
	index,
	isSelected,
	onRename,
	onDelete,
	onSelect,
}: {
	readonly item: ImportItem;
	readonly index: number;
	readonly isSelected: boolean;
	readonly onRename: (name: string) => void;
	readonly onDelete: () => void;
	readonly onSelect: () => void;
}) {
	const vertexCount = Math.max((item.geometry.coordinates[0]?.length ?? 1) - 1, 0);
	return (
		<li
			className={cn(
				'grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border p-2',
				isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/50',
			)}
		>
			<div className="grid min-w-0 gap-1">
				<Input
					aria-label={`Name for polygon ${index + 1}`}
					onChange={(event) => onRename(event.target.value)}
					onFocus={onSelect}
					value={item.name}
				/>
				<button
					className="w-fit text-left text-muted-foreground text-xs hover:text-foreground"
					onClick={onSelect}
					type="button"
				>
					{vertexCount} vertices · show on map
				</button>
			</div>
			<Button
				aria-label={`Remove ${item.name}`}
				className="text-muted-foreground hover:text-destructive"
				onClick={onDelete}
				size="icon"
				type="button"
				variant="ghost"
			>
				<DeleteIcon aria-hidden="true" />
			</Button>
		</li>
	);
}

function fitMapToItems(map: MapboxMap, items: readonly ImportItem[]): void {
	let west = Number.POSITIVE_INFINITY;
	let south = Number.POSITIVE_INFINITY;
	let east = Number.NEGATIVE_INFINITY;
	let north = Number.NEGATIVE_INFINITY;
	for (const item of items) {
		for (const ring of item.geometry.coordinates) {
			for (const [lng, lat] of ring) {
				west = Math.min(west, lng);
				south = Math.min(south, lat);
				east = Math.max(east, lng);
				north = Math.max(north, lat);
			}
		}
	}
	if (!Number.isFinite(west)) {
		return;
	}
	map.fitBounds(
		[
			[west, south],
			[east, north],
		],
		{ padding: 56, maxZoom: 15, duration: 500 },
	);
}
