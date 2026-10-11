import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { LocateFixedIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useAddressGeometry } from '../../../hooks/gis/use-address-geometry';
import { useAddress } from '../../../hooks/queries/use-address';
import { useRecordTags } from '../../../hooks/queries/use-record-tags';
import { formatAddressLine } from '../../../lib/address-format';
import { recordNoun } from '../../../lib/record-nouns';
import { MapCard, MapCardDetail, MapCardEyebrow, mapCardCoordinates } from '../../map/map-card';
import type { MapInset } from '../../map/map-inset';
import { TagBadge } from '../../tag-badge';

/**
 * The map focus card for an address. Reads the address through
 * {@link useAddress}, its tags alongside it, and its point geometry over HTTP.
 * It moves no camera: the explorer flies to the selection (#1423).
 */
export function AddressMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { address } = useAddress(id);

	const geometryQuery = useAddressGeometry(id);
	const lat = geometryQuery.data?.lat ?? null;
	const lng = geometryQuery.data?.lng ?? null;

	const tags = useRecordTags(id);

	if (address === undefined) {
		return (
			<MapCard
				className="max-w-[420px]"
				inset={inset}
				onClose={onClose}
				title={recordNoun('address').title}
			>
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
			eyebrow={<MapCardEyebrow recordType="address" />}
			inset={inset}
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
						{mapCardCoordinates({ lat, lng })}
					</MapCardDetail>
				)}
			</div>
		</MapCard>
	);
}
