import type { BoundingBox } from '@simmer-mosquito/mapping';
import { formatBoundingBox } from '@simmer-mosquito/mapping';
import type { HabitatDisplayRow, HabitatTypeRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	PlusIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../auth';
import { MapView } from '../map';
import { createHabitatTileSource, type HabitatTileFilters } from '../map/styles';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';

type LifecycleFilter = 'all' | 'active' | 'inactive';
type AccessFilter = 'all' | 'accessible' | 'inaccessible';

interface HabitatFilters {
	readonly lifecycle: LifecycleFilter;
	readonly access: AccessFilter;
	readonly habitatTypeId: string;
}

interface VisibleHabitat {
	readonly row: HabitatDisplayRow;
	readonly typeName: string;
}

const initialFilters: HabitatFilters = {
	access: 'all',
	habitatTypeId: 'all',
	lifecycle: 'active',
};

export const Route = createFileRoute('/habitats')({
	component: HabitatsRoute,
});

function HabitatsRoute() {
	const [filters, setFilters] = useState<HabitatFilters>(initialFilters);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const bounds = useMapBounds(map);
	const { rows: habitatRows } = useVisibleHabitatRows(bounds, filters);
	const { rows: habitatTypes } = useCollectionRows(webCollections.habitatTypes);
	const tileFilters = useMemo(() => toTileFilters(filters), [filters]);
	const habitatSource = useMemo(
		() => createHabitatTileSource({ filters: tileFilters }),
		[tileFilters],
	);
	const typeNameById = useMemo(() => {
		const names = new Map<string, string>();
		for (const row of habitatTypes) {
			names.set(row.id, row.name);
		}
		return names;
	}, [habitatTypes]);
	const visibleHabitats = useMemo(
		() =>
			habitatRows.map((row) => ({
				row,
				typeName:
					row.habitatTypeId === null
						? 'Unassigned type'
						: (typeNameById.get(row.habitatTypeId) ?? 'Unknown type'),
			})),
		[habitatRows, typeNameById],
	);
	const handleMapReady = useCallback((nextMap: MapboxMap) => {
		setMap(nextMap);
	}, []);
	const common = {
		bounds,
		filters,
		habitatTypes,
		onFiltersChange: setFilters,
		onMapReady: handleMapReady,
		source: habitatSource,
		visibleHabitats,
	};

	return (
		<div className="h-full min-h-0 overflow-hidden">
			<AtlasDesign {...common} />
		</div>
	);
}

function AtlasDesign(props: HabitatDesignProps) {
	return (
		<section className="grid h-full min-h-0 grid-cols-[minmax(420px,1fr)_minmax(360px,0.44fr)] gap-4 overflow-hidden max-[1120px]:grid-cols-1">
			<div className="min-h-0 overflow-hidden rounded-md border border-border/40 bg-card">
				<HabitatMap className="rounded-none border-0" {...props} />
			</div>
			<Card variant="surface" className="flex min-h-0 flex-col border border-border/40">
				<CardHeader className="px-4 py-4">
					<div>
						<CardTitle>Habitats</CardTitle>
						<CardDescription>{visibleCountLabel(props.visibleHabitats.length)}</CardDescription>
					</div>
					<CardAction>
						<Button asChild size="sm">
							<Link to="/habitats/create">
								<PlusIcon data-icon="inline-start" />
								New habitat
							</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent padding="compact" className="flex min-h-0 flex-1 flex-col gap-4">
					<HabitatFiltersPanel {...props} />
					<Separator />
					<HabitatCards habitats={props.visibleHabitats} />
				</CardContent>
			</Card>
		</section>
	);
}

interface HabitatDesignProps {
	readonly bounds: BoundingBox | null;
	readonly filters: HabitatFilters;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly onFiltersChange: (filters: HabitatFilters) => void;
	readonly onMapReady: (map: MapboxMap) => void;
	readonly source: ReturnType<typeof createHabitatTileSource>;
	readonly visibleHabitats: readonly VisibleHabitat[];
}

function HabitatMap({
	className,
	onMapReady,
	source,
}: HabitatDesignProps & {
	readonly className?: string;
}) {
	return (
		<MapView
			className={cn('min-h-0', className)}
			onMapReady={onMapReady}
			reuseKey="habitats-index-map"
			vectorTileSources={[source]}
		/>
	);
}

function HabitatFiltersPanel({ filters, habitatTypes, onFiltersChange }: HabitatDesignProps) {
	return (
		<FieldGroup className="grid gap-4">
			<Field>
				<FieldLabel>Lifecycle</FieldLabel>
				<Select
					onValueChange={(value) =>
						onFiltersChange({ ...filters, lifecycle: value as LifecycleFilter })
					}
					value={filters.lifecycle}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Lifecycle" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">All habitats</SelectItem>
							<SelectItem value="active">Active only</SelectItem>
							<SelectItem value="inactive">Inactive only</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel>Access</FieldLabel>
				<Select
					onValueChange={(value) => onFiltersChange({ ...filters, access: value as AccessFilter })}
					value={filters.access}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Access" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">All access states</SelectItem>
							<SelectItem value="accessible">Accessible</SelectItem>
							<SelectItem value="inaccessible">Inaccessible</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel>Habitat type</FieldLabel>
				<Select
					onValueChange={(value) => onFiltersChange({ ...filters, habitatTypeId: value })}
					value={filters.habitatTypeId}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Type" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">All types</SelectItem>
							{habitatTypes.map((type) => (
								<SelectItem key={type.id} value={type.id}>
									{type.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
		</FieldGroup>
	);
}

function HabitatCards({ habitats }: { readonly habitats: readonly VisibleHabitat[] }) {
	if (habitats.length === 0) {
		return <HabitatEmpty />;
	}

	return (
		<ScrollArea className="min-h-0 flex-1 pr-3">
			<div className="grid gap-3">
				{habitats.map((habitat) => (
					<Card
						key={habitat.row.id}
						variant="inset"
						className="border border-border/40 bg-muted/30"
					>
						<CardHeader className="px-4 py-4">
							<div className="grid gap-1">
								<CardTitle className="text-[0.98rem]">{habitatName(habitat.row)}</CardTitle>
								<CardDescription>{habitat.typeName}</CardDescription>
							</div>
							<CardAction>
								<HabitatStateBadge habitat={habitat.row} />
							</CardAction>
						</CardHeader>
						<CardContent padding="compact" className="grid gap-3">
							<p className="m-0 line-clamp-2 text-[0.88rem] text-muted-foreground">
								{habitatDescription(habitat.row)}
							</p>
							<HabitatFacts habitat={habitat.row} />
						</CardContent>
					</Card>
				))}
			</div>
		</ScrollArea>
	);
}

function HabitatFacts({ habitat }: { readonly habitat: HabitatDisplayRow }) {
	return (
		<div className="grid grid-cols-3 gap-2 text-[0.78rem] max-[560px]:grid-cols-1">
			<Fact label="Geometry" value={habitat.geomType} />
			<Fact label="Location" value={coordinateLabel(habitat)} />
			<Fact label="Updated" value={formatShortDate(habitat.updatedAt)} />
		</div>
	);
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-background px-2.5 py-2">
			<span className="font-bold text-muted-foreground">{label}</span>
			<strong className="truncate font-semibold text-foreground">{value}</strong>
		</div>
	);
}

function HabitatStateBadge({ habitat }: { readonly habitat: HabitatDisplayRow }) {
	if (habitat.isInaccessible) {
		return (
			<Badge variant="outline" tone="danger">
				<AlertTriangleIcon aria-hidden="true" />
				Inaccessible
			</Badge>
		);
	}

	if (habitat.isActive) {
		return (
			<Badge variant="outline" tone="success">
				<CheckCircle2Icon aria-hidden="true" />
				Active
			</Badge>
		);
	}

	return (
		<Badge variant="outline" tone="neutral">
			Inactive
		</Badge>
	);
}

function HabitatEmpty() {
	return (
		<Empty className="min-h-[220px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>No habitats in the current display</EmptyTitle>
				<EmptyDescription>
					Pan the map or loosen filters to bring habitat records into the bounded list.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function useMapBounds(map: MapboxMap | null): BoundingBox | null {
	const [bounds, setBounds] = useState<BoundingBox | null>(null);

	useEffect(() => {
		if (map === null) {
			setBounds(null);
			return;
		}

		const activeMap = map;
		function updateBounds() {
			const nextBounds = activeMap.getBounds();
			if (nextBounds === null) {
				return;
			}

			setBounds({
				east: nextBounds.getEast(),
				north: nextBounds.getNorth(),
				south: nextBounds.getSouth(),
				west: nextBounds.getWest(),
			});
		}

		updateBounds();
		activeMap.on('moveend', updateBounds);
		activeMap.on('zoomend', updateBounds);
		activeMap.on('resize', updateBounds);

		return () => {
			activeMap.off('moveend', updateBounds);
			activeMap.off('zoomend', updateBounds);
			activeMap.off('resize', updateBounds);
		};
	}, [map]);

	return bounds;
}

function useVisibleHabitatRows(
	bounds: BoundingBox | null,
	filters: HabitatFilters,
): {
	readonly rows: readonly HabitatDisplayRow[];
} {
	const queryBounds = bounds === null ? null : normalizeMapBoundsForQuery(bounds);
	const bbox = queryBounds === null ? null : formatBoundingBox(queryBounds);
	const { data } = useSuspenseQuery({
		queryKey: [
			'habitats',
			'visible',
			bbox,
			filters.lifecycle,
			filters.access,
			filters.habitatTypeId,
		],
		queryFn: ({ signal }) => fetchVisibleHabitatRows(queryBounds, filters, signal),
	});

	return { rows: data };
}

async function fetchVisibleHabitatRows(
	bounds: BoundingBox | null,
	filters: HabitatFilters,
	signal: AbortSignal,
): Promise<readonly HabitatDisplayRow[]> {
	if (bounds === null) {
		return [];
	}

	const url = new URL('/map/habitats', getServerUrl());
	url.searchParams.set('bbox', formatBoundingBox(bounds));
	url.searchParams.set('limit', '50');

	const tileFilters = toTileFilters(filters);
	if (tileFilters.isActive !== undefined) {
		url.searchParams.set('isActive', String(tileFilters.isActive));
	}
	if (tileFilters.isInaccessible !== undefined) {
		url.searchParams.set('isInaccessible', String(tileFilters.isInaccessible));
	}
	if (tileFilters.habitatTypeId !== undefined) {
		url.searchParams.set('habitatTypeId', tileFilters.habitatTypeId.join(','));
	}

	const response = await fetch(url, {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		throw new Error(`Habitats request failed with ${response.status}`);
	}

	const body = (await response.json()) as { readonly habitats?: readonly HabitatDisplayRow[] };
	return body.habitats ?? [];
}

function normalizeMapBoundsForQuery(bounds: BoundingBox): BoundingBox {
	const south = clamp(bounds.south, -90, 90);
	const north = clamp(bounds.north, -90, 90);
	const span = bounds.east - bounds.west;

	if (!Number.isFinite(span) || span >= 360) {
		return {
			east: 180,
			north,
			south,
			west: -180,
		};
	}

	const west = clamp(bounds.west, -180, 180);
	const east = clamp(bounds.east, -180, 180);

	if (west > east) {
		return {
			east: 180,
			north,
			south,
			west: -180,
		};
	}

	return {
		east,
		north,
		south,
		west,
	};
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

function toTileFilters(filters: HabitatFilters): HabitatTileFilters {
	return {
		...(filters.lifecycle === 'all' ? {} : { isActive: filters.lifecycle === 'active' }),
		...(filters.access === 'all' ? {} : { isInaccessible: filters.access === 'inaccessible' }),
		...(filters.habitatTypeId === 'all' ? {} : { habitatTypeId: [filters.habitatTypeId] }),
	};
}

function habitatName(habitat: HabitatDisplayRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}

function habitatDescription(habitat: HabitatDisplayRow): string {
	return habitat.description.trim() || 'No description recorded.';
}

function coordinateLabel(habitat: HabitatDisplayRow): string {
	return `${habitat.lat.toFixed(4)}, ${habitat.lng.toFixed(4)}`;
}

function visibleCountLabel(total: number): string {
	return `Showing ${total} habitats in map bounds, limit 50`;
}

function formatShortDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(date);
}
