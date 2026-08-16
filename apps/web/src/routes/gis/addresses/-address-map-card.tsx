import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { LocateFixedIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
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
import { useAddress } from '../../../hooks/queries/use-address';
import { useRecordTags } from '../../../hooks/queries/use-record-tags';
import { formatAddressLine } from '../../../lib/address-format';
import { useAddressGeometry } from './-address-data';

/**
 * The map focus card for an address. Reads the address through {@link useAddress},
 * its tags alongside it, and its point geometry — which is kept out of the sync
 * shape — over HTTP, to fly the map to it and to show its coordinates.
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
	const { address } = useAddress(id);

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
