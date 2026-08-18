import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { iconRegistry, Loader2Icon, SearchIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { ilike, or, useLiveQuery } from '@tanstack/react-db';
import { useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { OptionRow, PickerFallback } from '../../components/pickers/entity-picker';
import { useRegionFolders } from '../../hooks/queries/use-region-folders';
import { fetchRegionGeometryOnce } from '../../hooks/use-region-geometry';
import { regions } from '../../lib/collections/regions';
import type { DrawGeometry } from './use-map-draw';

/**
 * "Use one of the agency's regions as this polygon."
 *
 * Agencies already maintain their service areas, zones, and districts as regions
 * (`/gis/regions`), and records are routinely scoped to exactly one of them — so
 * re-tracing a district by hand is busywork. This searches the region list and
 * hands the chosen boundary back as a drawn polygon the user can still redraw.
 *
 * Regions sync on demand and their boundary is excluded from the sync shape, so
 * the list comes from a live subset query (like `AddressPicker`) and the polygon
 * itself is fetched over HTTP only for the region the user actually picks.
 */

const RegionIcon = iconRegistry.entities.region.icon;
const searchGcTimeMs = 30_000;
const resultLimit = 8;

export type PolygonGeometry = DrawGeometry & { readonly type: 'Polygon' };

/** A Region as this picker lists one: enough to name it and tell two apart. */
interface RegionOption {
	readonly id: string;
	readonly name: string;
	/** `null` when the Region sits at the top level, unfiled. */
	readonly folderId: string | null;
}

export function RegionBoundaryPicker({
	organizationId,
	disabled = false,
	onSelect,
}: {
	readonly organizationId: string;
	readonly disabled?: boolean;
	readonly onSelect: (geometry: PolygonGeometry) => void;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [loadingId, setLoadingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const deferredSearch = useDeferredValue(search);

	// Not named `use*`: it is an event handler, not a hook.
	async function adoptRegion(region: RegionOption) {
		setLoadingId(region.id);
		setError(null);
		try {
			const geometry = await fetchRegionGeometryOnce(queryClient, region.id);
			const polygon = polygonFromGeoJson(geometry?.geojson ?? null);
			if (polygon === null) {
				setError(
					geometry?.geojson == null
						? `${region.name} has no boundary saved.`
						: `${region.name} has a multi-part boundary, which can't be used as a single polygon.`,
				);
				return;
			}
			onSelect(polygon);
			setOpen(false);
			setSearch('');
		} catch {
			setError('Unable to load that region boundary.');
		} finally {
			setLoadingId(null);
		}
	}

	return (
		<Popover
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setError(null);
				}
			}}
			open={open}
		>
			<PopoverTrigger asChild>
				<Button
					aria-label="Fill this polygon from a region boundary"
					disabled={disabled}
					size="sm"
					type="button"
					variant="outline"
				>
					<RegionIcon aria-hidden="true" data-icon="inline-start" />
					Region
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="grid w-80 gap-2 p-2">
				<div className="relative">
					<SearchIcon
						aria-hidden="true"
						className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
					/>
					<Input
						className="pl-9"
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search regions"
						value={search}
					/>
				</div>
				<RegionResults
					loadingId={loadingId}
					onSelect={(region) => void adoptRegion(region)}
					organizationId={organizationId}
					search={deferredSearch}
				/>
				{error === null ? null : <p className="m-0 px-1 text-destructive text-xs">{error}</p>}
			</PopoverContent>
		</Popover>
	);
}

function RegionResults({
	organizationId,
	search,
	loadingId,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly loadingId: string | null;
	readonly onSelect: (region: RegionOption) => void;
}) {
	const normalized = search.trim();
	const pattern = `%${normalized}%`;
	const folderNames = useRegionFolderNames();
	const { data, isReady, isError } = useLiveQuery(
		{
			gcTime: searchGcTimeMs,
			query: (query) => {
				// No organization predicate: the shape is scoped to the agency
				// server-side, so re-stating it here is redundant — and a stale column
				// spelling in one is what empties a list rather than narrowing it.
				const base = query.from({ region: regions });
				const filtered =
					normalized.length === 0
						? base
						: base.where(({ region }) =>
								or(ilike(region.name, pattern), ilike(region.description, pattern)),
							);
				return filtered
					.orderBy(({ region }) => region.name, 'asc')
					.limit(resultLimit)
					.select(({ region }) => ({
						id: region.id,
						name: region.name,
						folderId: region.region_folder_id,
					}));
			},
		},
		[organizationId, pattern],
	);

	if (isError) {
		return <PickerFallback label="Regions unavailable" />;
	}
	const matches = data ?? [];
	// Only show the loading line on the first load; once the subset is warm,
	// re-opening keeps the prior results visible while it refreshes.
	if (!isReady && matches.length === 0) {
		return <PickerFallback label="Searching regions" />;
	}
	if (matches.length === 0) {
		return <PickerFallback label="No region matches" />;
	}

	return (
		<div className="grid gap-1">
			{matches.map((region) =>
				region.id === loadingId ? (
					<div
						className="flex min-h-11 items-center gap-2 px-2 py-1.5 text-muted-foreground text-sm"
						key={region.id}
					>
						<Loader2Icon aria-hidden="true" className="animate-spin" />
						Loading {region.name}…
					</div>
				) : (
					<OptionRow
						key={region.id}
						onSelect={() => onSelect(region)}
						primary={region.name}
						secondary={folderLabel(region, folderNames)}
						selected={false}
					/>
				),
			)}
		</div>
	);
}

/**
 * Region names repeat across folders — every district has a "Zone 1" — so the
 * folder is what tells two same-named results apart. Folders sync eagerly and
 * are few, so the whole list is read once and matched in memory; a non-suspense
 * query keeps the popover from suspending the page around it.
 */
function useRegionFolderNames(): ReadonlyMap<string, string> {
	const { folders } = useRegionFolders();

	return useMemo(
		() => new Map(folders.map((folder) => [folder.id, folder.name] as const)),
		[folders],
	);
}

function folderLabel(region: RegionOption, folderNames: ReadonlyMap<string, string>): string {
	if (region.folderId === null) {
		return 'Unfiled';
	}
	return folderNames.get(region.folderId) ?? 'Unknown folder';
}

/**
 * Narrow a stored region boundary to the single polygon the draw flow edits.
 * Regions are drawn and imported as single polygons, but a MultiPolygon with one
 * member reads the same on the map, so it is unwrapped rather than refused.
 */
function polygonFromGeoJson(geojson: GeoJsonGeometry | null): PolygonGeometry | null {
	if (geojson === null || typeof geojson !== 'object') {
		return null;
	}
	const candidate = geojson as { readonly type?: unknown; readonly coordinates?: unknown };
	if (!Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
		return null;
	}
	if (candidate.type === 'Polygon') {
		return candidate as unknown as PolygonGeometry;
	}
	if (candidate.type === 'MultiPolygon' && candidate.coordinates.length === 1) {
		return {
			type: 'Polygon',
			coordinates: candidate.coordinates[0] as PolygonGeometry['coordinates'],
		};
	}
	return null;
}
