import { boundsFromGeoJson } from '@simmer-mosquito/mapping';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import { MapCard, MapCardEyebrow, MapCardText } from '../../../components/map/map-card';
import type { MapInset } from '../../../components/map/map-inset';
import { TagBadge } from '../../../components/tag-badge';
import { useRecordTags } from '../../../hooks/queries/use-record-tags';
import { useRegion } from '../../../hooks/queries/use-region';
import { useRegionGeometry } from '../../../hooks/use-region-geometry';

/**
 * The map focus card for a region. Reads the region through {@link useRegion},
 * its tags alongside it, and its polygon — which is kept out of the sync shape —
 * over HTTP, to fit the map to its bounds.
 */
export function RegionMapCard({
	id,
	map,
	inset,
	onClose,
}: {
	readonly id: string;
	readonly map: MapboxMap | null;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { region } = useRegion(id);

	const geometryQuery = useRegionGeometry(id);
	const geojson = geometryQuery.data?.geojson ?? null;

	const tags = useRecordTags(id);

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
			<MapCard className="max-w-[420px]" inset={inset} onClose={onClose} title="Region">
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
			inset={inset}
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
