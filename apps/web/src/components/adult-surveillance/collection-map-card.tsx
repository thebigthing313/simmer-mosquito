import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { AdultCollection } from '../../hooks/queries/collection-view';
import { collectionPlaceLabel } from '../../hooks/queries/trap-view';
import { useAdultCollection } from '../../hooks/queries/use-adult-collection';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { recordNoun } from '../../lib/record-nouns';
import { MapCardAddress } from '../linked-address';
import { MapCard, MapCardDetail, MapCardEyebrow, mapCardCoordinates } from '../map/map-card';
import type { MapInset } from '../map/map-inset';
import { CollectionFlagBadges, collectionEffectiveDate } from './adult-display';

const CollectionEntityIcon = iconRegistry.entities.collection.icon;

/**
 * The map focus card for an adult collection. One query brings the collection
 * up with its trap, method and address joined ({@link useAdultCollection}).
 */
export function CollectionMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { collection } = useAdultCollection(id);
	const timeZone = useOrganizationTimeZone();

	if (collection === undefined) {
		return (
			<MapCard inset={inset} onClose={onClose} title={recordNoun('collection').title}>
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const effectiveDate = collectionEffectiveDate(collection, timeZone);

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={effectiveDate ?? undefined} recordType="collection" />}
			inset={inset}
			onClose={onClose}
			title={collectionTitle(collection)}
			viewDetailLink={(content) => (
				<Link params={{ id: collection.id }} to="/adult-surveillance/collections/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-3">
				<CollectionFlagBadges
					className="flex flex-wrap items-center gap-1.5"
					collection={collection}
				/>
				<div className="grid gap-1.5">
					<MapCardDetail icon={CollectionEntityIcon}>{collection.methodName}</MapCardDetail>
					<MapCardAddress address={collection.address} addressId={collection.addressId} />
					<MapCardDetail icon={LocateFixedIcon} mono>
						{mapCardCoordinates({ lat: collection.latitude, lng: collection.longitude })}
					</MapCardDetail>
				</div>
			</div>
		</MapCard>
	);
}

/**
 * A collection is titled by the trap it came from, then the address, then its
 * own coordinates, then the word ({@link collectionPlaceLabel}).
 *
 * The one rung this card has that the helper does not is the placeholder while
 * the trap row is in flight: `resolvedTrapId` is the column that tells a trap
 * still arriving from one with no name, and this is the only collection surface
 * that carries it.
 */
function collectionTitle(collection: AdultCollection): string {
	if (collection.trapId !== null && collection.resolvedTrapId === undefined) {
		return 'Collection';
	}
	return collectionPlaceLabel(collection);
}
