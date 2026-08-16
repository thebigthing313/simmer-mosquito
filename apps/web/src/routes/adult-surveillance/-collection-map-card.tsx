import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { MapCardAddress } from '../../components/linked-address';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../components/map/map-card';
import { trapDisplayName } from '../../hooks/queries/trap-view';
import { useAdultCollection } from '../../hooks/queries/use-adult-collection';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { CollectionFlagBadges, collectionEffectiveDate } from './-adult-display';

const CollectionEntityIcon = iconRegistry.entities.collection.icon;

/**
 * The map focus card for an adult collection. One query brings the collection up
 * with its trap, method and address already joined ({@link useAdultCollection}),
 * so the card fills in as they arrive rather than in four steps. Drop
 * `<CollectionMapCard id onClose />` beside any MapCanvas that plots collections.
 */
export function CollectionMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const { collection } = useAdultCollection(id);
	const timeZone = useOrganizationTimeZone();

	if (collection === undefined) {
		return (
			<MapCard onClose={onClose} title="Collection">
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
			eyebrow={<MapCardEyebrow date={effectiveDate ?? undefined} type="Collection" />}
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
						{coordinateLabel({ lat: collection.latitude, lng: collection.longitude })}
					</MapCardDetail>
				</div>
			</div>
		</MapCard>
	);
}

/**
 * A collection is titled by the trap it came from — named for good when there is
 * no trap, named in a moment when the join has not landed yet.
 */
function collectionTitle(collection: {
	readonly trapId: string | null;
	readonly resolvedTrapId: string | undefined;
	readonly trapName: string | null;
	readonly trapCode: string | null;
}): string {
	if (collection.trapId === null) {
		return 'Ad-hoc collection';
	}
	if (collection.resolvedTrapId === undefined) {
		return 'Collection';
	}
	return trapDisplayName({
		id: collection.trapId,
		trapName: collection.trapName,
		trapCode: collection.trapCode,
	});
}
