import type { AddressRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { LocateFixedIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../../components/map/map-card';
import { TagBadge } from '../../../components/tag-badge';
import { useRecordTags } from '../../../hooks/queries/use-record-tags';
import { formatAddressLine } from '../../../lib/address-format';
import { webCollections } from '../../../sync/webCollections';
import { useAddressGeometry } from './-address-data';

const gcTimeMs = 30_000;

/**
 * The map focus card for an address. Self-fetches the address off the on-demand
 * collection, its tags off the eager catalog, and its point geometry (kept out of
 * the sync shape) over HTTP — to fly the map to it and to show its coordinates —
 * then renders the shared {@link MapCard}.
 */
export function AddressMapCard({
	id,
	map,
	onClose,
}: {
	readonly id: string;
	readonly map: MapboxMap | null;
	readonly onClose: () => void;
}) {
	const addressResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, id))
					.findOne(),
		},
		[id],
	);
	const address = addressResult.data as AddressRow | undefined;

	const geometryQuery = useAddressGeometry(id);
	const lat = geometryQuery.data?.lat ?? null;
	const lng = geometryQuery.data?.lng ?? null;

	const tags = useRecordTags(id);

	useEffect(() => {
		if (map === null || lat === null || lng === null) {
			return;
		}
		map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
	}, [map, lat, lng]);

	if (address === undefined) {
		return (
			<MapCard className="max-w-[420px]" onClose={onClose} title="Address">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const line = formatAddressLine(address);

	return (
		<MapCard
			badges={
				tags.length === 0 ? undefined : tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)
			}
			className="max-w-[420px]"
			eyebrow={<MapCardEyebrow type="Address" />}
			onClose={onClose}
			title={address.displayName}
			viewDetailLink={(content) => (
				<Link params={{ id: address.id }} to="/gis/addresses/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				{line.length === 0 ? null : <MapCardDetail icon={MapPinnedIcon}>{line}</MapCardDetail>}
				{lat === null || lng === null ? null : (
					<MapCardDetail icon={LocateFixedIcon} mono>
						{coordinateLabel({ lat, lng })}
					</MapCardDetail>
				)}
			</div>
		</MapCard>
	);
}
