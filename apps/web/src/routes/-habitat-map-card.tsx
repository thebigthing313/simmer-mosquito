import type { AddressRow, HabitatRow, HabitatTypeRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ComponentIcon,
	LocateFixedIcon,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardText,
} from '../components/map/map-card';
import { TagBadge } from '../components/tag-badge';
import { useMapCardTags } from '../hooks/use-map-card-tags';
import { webCollections } from '../sync/webCollections';
import { addressCardLabel } from './-address-format';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The map focus card for a habitat. Resolves the habitat off the on-demand
 * collection, its type off the eager lookup, its address off the on-demand
 * collection, and its tags off the eager catalog, then renders the shared
 * {@link MapCard}. `detailTo` selects the detail route the "View details" link
 * targets; the habitats explorer under larval-surveillance passes the route its
 * own list rows link to.
 */
export function HabitatMapCard({
	id,
	onClose,
	detailTo = '/larval-surveillance/habitats/$id',
}: {
	readonly id: string;
	readonly onClose: () => void;
	readonly detailTo?: '/larval-surveillance/habitats/$id';
}) {
	const habitatResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ habitat: webCollections.habitats })
					.where(({ habitat }) => eq(habitat.id, id))
					.findOne(),
		},
		[id],
	);
	const habitat = habitatResult.data as HabitatRow | undefined;

	const typeId = habitat?.habitatTypeId ?? UNMATCHABLE_ID;
	const typeResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ type: webCollections.habitatTypes })
					.where(({ type }) => eq(type.id, typeId))
					.findOne(),
		},
		[typeId],
	);
	const habitatType = typeResult.data as HabitatTypeRow | undefined;

	const addressId = habitat?.addressId ?? UNMATCHABLE_ID;
	const addressResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, addressId))
					.findOne(),
		},
		[addressId],
	);
	const address = addressResult.data as AddressRow | undefined;

	const tags = useMapCardTags(id);

	if (habitat === undefined) {
		return (
			<MapCard onClose={onClose} title="Habitat">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const title = habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
	const typeName =
		habitat.habitatTypeId === null ? 'Unassigned type' : (habitatType?.name ?? 'Unknown type');
	const description = habitat.description.trim();
	const addressLabel = addressCardLabel(address);

	return (
		<MapCard
			badges={
				<>
					<HabitatStateBadge habitat={habitat} />
					{tags.map((tag) => (
						<TagBadge key={tag.id} tag={tag} />
					))}
				</>
			}
			eyebrow={<MapCardEyebrow type="Habitat" />}
			onClose={onClose}
			title={title}
			viewDetailLink={(content) => (
				<Link params={{ id: habitat.id }} to={detailTo}>
					{content}
				</Link>
			)}
		>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<MapCardDetail icon={ComponentIcon}>{typeName}</MapCardDetail>
					<MapCardDetail icon={MapPinnedIcon}>
						{addressLabel ?? <span className="italic">No linked address</span>}
					</MapCardDetail>
					<MapCardDetail icon={LocateFixedIcon} mono>
						{coordinateLabel(habitat)}
					</MapCardDetail>
				</div>
				{description.length === 0 ? null : <MapCardText>{description}</MapCardText>}
			</div>
		</MapCard>
	);
}

function HabitatStateBadge({ habitat }: { readonly habitat: HabitatRow }) {
	if (habitat.isInaccessible) {
		return (
			<Badge tone="danger" variant="outline">
				<AlertTriangleIcon aria-hidden="true" />
				Inaccessible
			</Badge>
		);
	}
	if (habitat.isActive) {
		return (
			<Badge tone="success" variant="outline">
				<CheckCircle2Icon aria-hidden="true" />
				Active
			</Badge>
		);
	}
	return (
		<Badge tone="neutral" variant="outline">
			Inactive
		</Badge>
	);
}
