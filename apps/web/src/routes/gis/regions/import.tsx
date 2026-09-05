import type { ImportNote } from '@simmer-mosquito/mapping';
import { IMPORT_FILE_ACCEPT, readImportFileText } from '@simmer-mosquito/mapping';
import { isTxIdConfirmationTimeout } from '@simmer-mosquito/sync';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { Progress } from '@simmer-mosquito/ui-web/components/ui/progress';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import {
	ArrowLeftIcon,
	iconRegistry,
	Loader2Icon,
	PlusIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import {
	ImportNotes,
	type ImportNoun,
	type ImportRefusalCounts,
	importRowSummary,
} from '../../../components/map/import-notes';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useRegionMutations } from '../../../hooks/mutations/use-region-mutations';
import { useRegionFolders } from '../../../hooks/queries/use-region-folders';
import { regions } from '../../../lib/collections/regions';
import { isBelowRole } from '../../../lib/write-access';
import { RegionFolderDialog } from './-folder-dialog';
import { MAX_REGIONS, parseRegionsFromFile, type RegionBoundary } from './-import-parse';

export const Route = createFileRoute('/gis/regions/import')({
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/gis/regions' });
		}
	},
	component: ImportRegionsRoute,
});

const UploadIcon = iconRegistry.actions.upload.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const ShowOnMapIcon = iconRegistry.actions.locate.icon;
const UNFILED = 'unfiled';

/** How many region writes to keep in flight at once during an import. */
const IMPORT_CONCURRENCY = 6;
/**
 * How long to wait for a single region to be confirmed via Electric sync before
 * treating it as submitted-but-pending. The server write itself has already
 * happened by the time this fires; this only bounds the sync round-trip so a
 * stalled stream can't leave the whole import hanging forever.
 */
const PERSIST_TIMEOUT_MS = 15_000;

interface ImportProgress {
	readonly done: number;
	readonly total: number;
}

interface ImportItem {
	readonly id: string;
	readonly name: string;
	readonly geometry: RegionBoundary;
	readonly note: ImportNote | null;
}

const NO_REFUSALS: ImportRefusalCounts = { projected: 0, multipart: 0, mixed: 0 };

/** A Region is always an area here, so the notes have their word already. */
const AREA: ImportNoun = { one: 'area', many: 'areas' };

function ImportRegionsRoute() {
	const navigate = useNavigate();
	const { folders } = useRegionFolders();
	const mutations = useRegionMutations();

	// Keep the on-demand `regions` shape stream warm for the whole time the user is
	// on this page. A region write confirms only when its txid is observed on the
	// live shape stream; that stream opens at `offset:'now'`, so if it is cold when
	// the import fires (the collection is GC'd ~30s after the regions list unmounts —
	// well within the time it takes to upload and review a file) the concurrent
	// inserts race a fresh subscription and their txids can commit before it
	// connects, forcing a deterministic per-row confirmation timeout. Subscribing
	// here guarantees the stream is connected and up-to-date before the first insert.
	// The rows themselves are unused; we only need the subscription.
	useLiveQuery({ query: (query) => query.from({ region: regions() }) }, []);

	const [items, setItems] = useState<readonly ImportItem[]>([]);
	const [skipped, setSkipped] = useState(0);
	const [truncated, setTruncated] = useState(false);
	const [refusals, setRefusals] = useState<ImportRefusalCounts>(NO_REFUSALS);
	const [fileName, setFileName] = useState<string | null>(null);
	const [parseError, setParseError] = useState<string | null>(null);
	const [folderId, setFolderId] = useState<string>(UNFILED);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const [progress, setProgress] = useState<ImportProgress | null>(null);
	const [pendingSync, setPendingSync] = useState(0);
	const [importErrors, setImportErrors] = useState<readonly string[]>([]);
	const [isCreatingFolder, setIsCreatingFolder] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const canImport = items.length > 0 && mutations.canWrite && !isImporting;

	const handleFile = useCallback(async (file: File) => {
		setParseError(null);
		setImportErrors([]);
		setPendingSync(0);
		setSelectedId(null);
		setRefusals(NO_REFUSALS);
		try {
			const text = await readImportFileText(file);
			const result = parseRegionsFromFile(text, file.name);
			setFileName(file.name);
			setSkipped(result.skipped);
			setTruncated(result.truncated);
			setRefusals({
				projected: result.projected,
				multipart: result.multipart,
				mixed: result.mixed,
			});
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
					note: region.note,
				})),
			);
		} catch (error) {
			setParseError(error instanceof Error ? error.message : 'That file could not be read.');
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
				geometry: item.geometry as unknown as GeoJSON.Geometry,
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
		if (!mutations.canWrite) {
			return;
		}
		setIsImporting(true);
		setImportErrors([]);
		setPendingSync(0);
		const total = items.length;
		setProgress({ done: 0, total });

		const errors: string[] = [];
		let pending = 0;
		let done = 0;

		await forEachWithConcurrency(items, IMPORT_CONCURRENCY, async (item) => {
			try {
				const transaction = mutations.create(
					newRecordId(),
					{
						name: item.name.trim().length === 0 ? 'Region' : item.name.trim(),
						description: null,
						folderId: folderId === UNFILED ? null : folderId,
						metadata: null,
					},
					item.geometry,
				);
				// Fold persistence into a promise that never rejects, so once the
				// timeout wins the race the original rejection (if any) still has a
				// handler and can't surface as an unhandled rejection. A txid
				// confirmation timeout is not a failure — the server POST already
				// committed the write by the time the library waits for sync — so it
				// degrades to "pending" (awaiting sync) rather than "failed".
				const settled: Promise<'confirmed' | 'pending' | { readonly error: string }> =
					transaction.isPersisted.promise.then(
						() => 'confirmed' as const,
						(error) =>
							isTxIdConfirmationTimeout(error)
								? ('pending' as const)
								: { error: error instanceof Error ? error.message : 'failed to import' },
					);
				const outcome = await Promise.race([
					settled,
					delay(PERSIST_TIMEOUT_MS).then(() => 'pending' as const),
				]);
				if (outcome === 'pending') {
					pending += 1;
				} else if (outcome !== 'confirmed') {
					errors.push(`${item.name}: ${outcome.error}`);
				}
			} catch (error) {
				errors.push(`${item.name}: ${error instanceof Error ? error.message : 'failed to import'}`);
			} finally {
				done += 1;
				setProgress({ done, total });
			}
		});

		setIsImporting(false);
		setProgress(null);
		setImportErrors(errors);
		setPendingSync(pending);

		// Only leave the page when everything is fully confirmed; otherwise stay so
		// the summary (failures and/or pending-sync rows) is visible.
		if (errors.length === 0 && pending === 0) {
			await navigate({ to: '/gis/regions' });
		}
	}, [mutations, items, folderId, navigate]);

	return (
		<MapSplitPage
			map={
				<MapCanvas
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
				<header className={stickyHeader({ gap: 'tight', padding: 'roomy' })}>
					<Link className={backLink()} to="/gis/regions">
						<ArrowLeftIcon aria-hidden="true" />
						Regions
					</Link>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
							Import Regions
						</h1>
						<p className="m-0 text-muted-foreground text-sm">
							Upload a KML, KMZ, or GeoJSON file. Each feature in it becomes one region you can
							review before importing.
						</p>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<div className="grid gap-5">
						<div className="grid gap-2">
							<input
								accept={IMPORT_FILE_ACCEPT}
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
								{fileName === null ? 'Choose KML, KMZ, or GeoJSON File' : 'Choose a Different File'}
							</Button>
							{fileName === null ? null : (
								<p className="m-0 text-muted-foreground text-xs">
									{fileName} · {items.length} {items.length === 1 ? 'region' : 'regions'}
									{skipped > 0 ? ` · ${skipped} skipped` : ''}
								</p>
							)}
							<ImportNotes counts={refusals} noun={AREA} />
						</div>

						{parseError === null ? null : (
							<Alert variant="destructive">
								<AlertTitle>Couldn't Read That File</AlertTitle>
								<AlertDescription>{parseError}</AlertDescription>
							</Alert>
						)}

						{truncated ? (
							<Alert>
								<AlertTitle>Only the first {MAX_REGIONS} features were kept</AlertTitle>
								<AlertDescription>
									This file holds more than {MAX_REGIONS} features. To import the rest, split the
									file and upload the remaining features separately.
								</AlertDescription>
							</Alert>
						) : null}

						{items.length === 0 ? null : (
							<>
								<div className="grid gap-1.5">
									<Label htmlFor="import-folder">Import into folder</Label>
									<div className="flex items-center gap-2">
										<Select onValueChange={setFolderId} value={folderId}>
											<SelectTrigger className="flex-1" id="import-folder">
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
										<Button
											onClick={() => setIsCreatingFolder(true)}
											type="button"
											variant="outline"
										>
											<PlusIcon aria-hidden="true" data-icon="inline-start" />
											New Folder
										</Button>
									</div>
								</div>

								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<span className="font-semibold text-foreground text-sm">Regions to import</span>
										<Badge tone="neutral" variant="outline">
											{items.length}
										</Badge>
									</div>
									<ul className="grid gap-1">
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

								{pendingSync === 0 ? null : (
									<Alert>
										<AlertTitle>
											{pendingSync} {pendingSync === 1 ? 'region was' : 'regions() were'} saved,
											awaiting sync
										</AlertTitle>
										<AlertDescription className="grid gap-2">
											<span>
												The server accepted {pendingSync === 1 ? 'it' : 'them'} but hasn't confirmed
												the sync yet. {pendingSync === 1 ? 'It' : 'They'} should appear on the
												regions() list shortly.
											</span>
											<Button asChild className="w-fit" size="sm" type="button" variant="outline">
												<Link to="/gis/regions">Go to Regions</Link>
											</Button>
										</AlertDescription>
									</Alert>
								)}

								{progress === null ? null : (
									<div aria-live="polite" className="grid gap-1.5">
										<div className="flex items-center justify-between text-muted-foreground text-xs">
											<span>Importing regions()…</span>
											<span>
												{progress.done} of {progress.total}
											</span>
										</div>
										<Progress
											value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100}
										/>
									</div>
								)}
							</>
						)}
					</div>
				</div>

				{/* Outside the scroll area so a long polygon list never buries the actions. */}
				{items.length === 0 ? null : (
					<footer className="flex justify-end gap-2 border-border/50 border-t bg-background px-5 py-4">
						<Button asChild type="button" variant="ghost">
							<Link to="/gis/regions">Cancel</Link>
						</Button>
						<Button disabled={!canImport} onClick={runImport} type="button">
							{isImporting ? (
								<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
							) : null}
							{isImporting && progress !== null
								? `Importing ${progress.done} of ${progress.total}…`
								: `Import ${items.length} ${items.length === 1 ? 'region' : 'regions'}`}
						</Button>
					</footer>
				)}
			</div>
			{isCreatingFolder ? (
				<RegionFolderDialog
					folder={null}
					onClose={() => setIsCreatingFolder(false)}
					onSaved={setFolderId}
				/>
			) : null}
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
	return (
		<li className="flex items-center gap-1">
			<span className="grid min-w-0 flex-1 gap-0.5">
				<Input
					aria-label={`Name for region ${index + 1}`}
					className={cn('min-w-0', isSelected ? 'border-primary/60 bg-primary/5' : null)}
					onChange={(event) => onRename(event.target.value)}
					onFocus={onSelect}
					value={item.name}
				/>
				<span className="truncate px-1 text-muted-foreground text-xs">
					{importRowSummary(item.geometry, item.note)}
				</span>
			</span>
			<Button
				aria-label={`Show ${item.name} on the map`}
				className={cn(
					'text-muted-foreground hover:text-foreground',
					isSelected ? 'text-primary' : null,
				)}
				onClick={onSelect}
				size="icon"
				title="Show on the Map"
				type="button"
				variant="ghost"
			>
				<ShowOnMapIcon aria-hidden="true" />
			</Button>
			<Button
				aria-label={`Remove ${item.name}`}
				className="text-muted-foreground hover:text-destructive"
				onClick={onDelete}
				size="icon"
				title="Remove"
				type="button"
				variant="ghost"
			>
				<DeleteIcon aria-hidden="true" />
			</Button>
		</li>
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Run `worker` over `items` with at most `limit` in flight at once, resolving once
 * every item has settled. Workers are expected to handle their own errors; a throw
 * here would abort the whole run.
 */
async function forEachWithConcurrency<T>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			await worker(items[index] as T, index);
		}
	});
	await Promise.all(runners);
}

/**
 * Frame the map on `items`.
 *
 * It walks positions rather than rings, because a boundary in several pieces
 * nests one level deeper than one in a single piece. Walking rings gave a
 * multipart item `NaN` bounds, and the preview map then stopped fitting with no
 * error at all.
 */
function fitMapToItems(map: MapboxMap, items: readonly ImportItem[]): void {
	let west = Number.POSITIVE_INFINITY;
	let south = Number.POSITIVE_INFINITY;
	let east = Number.NEGATIVE_INFINITY;
	let north = Number.NEGATIVE_INFINITY;
	for (const item of items) {
		for (const [lng, lat] of boundaryPositions(item.geometry)) {
			west = Math.min(west, lng);
			south = Math.min(south, lat);
			east = Math.max(east, lng);
			north = Math.max(north, lat);
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

/** Every position a boundary holds, whichever depth its pieces sit at. */
function boundaryPositions(geometry: RegionBoundary): readonly (readonly [number, number])[] {
	const parts = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
	return parts.flat(2);
}
