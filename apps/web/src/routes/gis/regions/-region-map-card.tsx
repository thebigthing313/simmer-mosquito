import { boundsFromGeoJson } from '@simmer-mosquito/mapping';
import type { RegionRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import { MapCard, MapCardEyebrow, MapCardText } from '../../../components/map/map-card';
import { TagBadge } from '../../../components/tag-badge';
import { useMapCardTags } from '../../../hooks/use-map-card-tags';
import { useRegionGeometry } from '../../../hooks/use-region-geometry';
import { webCollections } from '../../../sync/webCollections';

const gcTimeMs = 30_000;

/**
 * The map focus card for a region. Self-fetches the region off the on-demand
 * collection, its tags off the eager catalog, and its polygon (kept out of the
 * sync shape) over HTTP to fit the map to its bounds, then renders the shared
 * {@link MapCard}.
 */
export function RegionMapCard({
	id,
	map,
	onClose,
}: {
	readonly id: string;
	readonly map: MapboxMap | null;
	readonly onClose: () => void;
}) {
	const regionResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ region: webCollections.regions })
					.where(({ region }) => eq(region.id, id))
					.findOne(),
		},
		[id],
	);
	const region = regionResult.data as RegionRow | undefined;

	const geometryQuery = useRegionGeometry(id);
	const geojson = geometryQuery.data?.geojson ?? null;

	const tags = useMapCardTags(id);

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

	if (region === undefined) {
		return (
			<MapCard className="max-w-[420px]" onClose={onClose} title="Region">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const description = region.description?.trim() ?? '';

	return (
		<MapCard
			badges={
				tags.length === 0 ? undefined : tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)
			}
			className="max-w-[420px]"
			eyebrow={<MapCardEyebrow type="Region" />}
			onClose={onClose}
			title={region.name}
			viewDetailLink={(content) => (
				<Link params={{ id: region.id }} to="/gis/regions/$id">
					{content}
				</Link>
			)}
		>
			{description.length === 0 ? null : <MapCardText divided={false}>{description}</MapCardText>}
		</MapCard>
	);
}
