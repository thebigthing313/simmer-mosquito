import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ComponentIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { MapCardAddress } from '../components/linked-address';
import {
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
	MapCardText,
} from '../components/map/map-card';
import { TagBadge } from '../components/tag-badge';
import type { Habitat } from '../hooks/queries/habitat-view';
import { useHabitat } from '../hooks/queries/use-habitat';
import { useMapCardTags } from '../hooks/use-map-card-tags';

/**
 * The map focus card for a Habitat.
 *
 * The Habitat arrives with its type name already joined; the address and the tags
 * are resolved by the shared components that show them. `detailTo` selects the
 * detail route the "View details" link targets; the habitats explorer under
 * larval-surveillance passes the route its own list rows link to.
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
	const { habitat } = useHabitat(id);
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

	// `name` is never empty — an unnamed Habitat reads out its coordinates, which is
	// what the short-id fallback used to stand in for.
	const typeName =
		habitat.typeId === null ? 'Unassigned type' : (habitat.typeName ?? 'Unknown type');
	const description = habitat.description.trim();

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
			title={habitat.name}
			viewDetailLink={(content) => (
				<Link params={{ id: habitat.id }} to={detailTo}>
					{content}
				</Link>
			)}
		>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<MapCardDetail icon={ComponentIcon}>{typeName}</MapCardDetail>
					<MapCardAddress address={habitat.address} addressId={habitat.addressId} />
					<MapCardLocation
						geomType={habitat.geometryKind}
						lat={habitat.latitude}
						lng={habitat.longitude}
					/>
				</div>
				{description.length === 0 ? null : <MapCardText>{description}</MapCardText>}
			</div>
		</MapCard>
	);
}

function HabitatStateBadge({ habitat }: { readonly habitat: Habitat }) {
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
