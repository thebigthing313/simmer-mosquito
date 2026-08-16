import type { AdultCollectionRow, CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { MapCardAddressById } from '../../components/linked-address';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../components/map/map-card';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { webCollections } from '../../sync/webCollections';
import { CollectionFlagBadges, collectionEffectiveDate, trapDisplayName } from './-adult-display';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const CollectionEntityIcon = iconRegistry.entities.collection.icon;

/**
 * The map focus card for an adult collection. Given the collection id it resolves
 * the collection off the on-demand collection (single-id lookups warm the subset),
 * its trap + method off the eager baseline collections, then renders the shared
 * {@link MapCard}. Drop `<CollectionMapCard id onClose />` beside any MapCanvas that
 * plots collections.
 */
export function CollectionMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const collectionResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => eq(collection.id, id))
					.findOne(),
		},
		[id],
	);
	const collection = collectionResult.data as AdultCollectionRow | undefined;

	const trapId = collection?.trapId ?? UNMATCHABLE_ID;
	const trapResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ trap: webCollections.traps })
					.where(({ trap }) => eq(trap.id, trapId))
					.findOne(),
		},
		[trapId],
	);
	const trap = trapResult.data as TrapRow | undefined;

	const methodId = collection?.collectionMethodId ?? UNMATCHABLE_ID;
	const methodResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ method: webCollections.collectionMethods })
					.where(({ method }) => eq(method.id, methodId))
					.findOne(),
		},
		[methodId],
	);
	const method = methodResult.data as CollectionMethodRow | undefined;
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

	const title =
		collection.trapId === null
			? 'Ad-hoc collection'
			: trap === undefined
				? 'Collection'
				: trapDisplayName(trap);
	const methodName = method?.name ?? 'Unknown method';
	const effectiveDate = collectionEffectiveDate(collection, timeZone);

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={effectiveDate ?? undefined} type="Collection" />}
			onClose={onClose}
			title={title}
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
					<MapCardDetail icon={CollectionEntityIcon}>{methodName}</MapCardDetail>
					<MapCardAddressById addressId={collection.addressId} />
					<MapCardDetail icon={LocateFixedIcon} mono>
						{coordinateLabel(collection)}
					</MapCardDetail>
				</div>
			</div>
		</MapCard>
	);
}
