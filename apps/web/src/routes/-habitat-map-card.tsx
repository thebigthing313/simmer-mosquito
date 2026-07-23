import type {
	AddressRow,
	HabitatRow,
	HabitatTypeRow,
	TagItemRow,
	TagRow,
} from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { AlertTriangleIcon, CheckCircle2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { coordinateLabel, MapCard, MapCardFact } from '../components/map/map-card';
import { TagBadge } from '../components/tag-badge';
import { webCollections } from '../sync/webCollections';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The map focus card for a habitat. Resolves the habitat off the on-demand
 * collection, its type off the eager lookup, its address off the on-demand
 * collection, and its tags off the eager catalog, then renders the shared
 * {@link MapCard}. `detailTo` selects the detail route tree the "View details"
 * link targets — the two habitat explorers live under different route trees, so
 * each passes the one its own list rows link to (defaults to `/habitats/$id`).
 */
export function HabitatMapCard({
	id,
	onClose,
	detailTo = '/habitats/$id',
}: {
	readonly id: string;
	readonly onClose: () => void;
	readonly detailTo?: '/habitats/$id' | '/larval-surveillance/habitats/$id';
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

	const tags = useHabitatTags(id);

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
	const addressLabel = habitat.addressId === null ? null : (address?.displayName ?? null);

	return (
		<MapCard
			badges={<HabitatStateBadge habitat={habitat} />}
			onClose={onClose}
			subtitle={typeName}
			title={title}
			viewDetailLink={(content) => (
				<Link params={{ id: habitat.id }} to={detailTo}>
					{content}
				</Link>
			)}
		>
			<div className="grid gap-3">
				{description.length === 0 ? null : (
					<p className="m-0 line-clamp-3 whitespace-pre-wrap text-muted-foreground text-sm leading-snug">
						{description}
					</p>
				)}
				{tags.length === 0 ? null : (
					<div className="flex flex-wrap gap-1.5">
						{tags.map((tag) => (
							<TagBadge key={tag.id} tag={tag} />
						))}
					</div>
				)}
				<dl className="grid grid-cols-2 gap-2 text-xs">
					<MapCardFact label="Geometry" value={formatGeometryTypeLabel(habitat.geomType)} />
					<MapCardFact label="Coordinates" value={coordinateLabel(habitat)} />
					<MapCardFact label="Address" value={addressLabel ?? 'No linked address'} wide />
				</dl>
			</div>
		</MapCard>
	);
}

/** The tags assigned to a habitat, resolved off the eager catalog. */
function useHabitatTags(id: string): readonly TagRow[] {
	const itemsResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query.from({ item: webCollections.tagItems }).where(({ item }) => eq(item.entityId, id)),
		},
		[id],
	);
	const catalogResult = useLiveQuery((query) => query.from({ tag: webCollections.tags }), []);

	return useMemo(() => {
		const tagById = new Map((catalogResult.data ?? []).map((tag) => [tag.id, tag as TagRow]));
		return ((itemsResult.data ?? []) as readonly TagItemRow[])
			.flatMap((item) => {
				const tag = tagById.get(item.tagId);
				return tag === undefined ? [] : [tag];
			})
			.sort((first, second) => first.tagName.localeCompare(second.tagName));
	}, [itemsResult.data, catalogResult.data]);
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

function formatGeometryTypeLabel(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/^st_?/, '')
		.replace(/[_\s]+/g, '');
	switch (normalized) {
		case 'point':
			return 'Point';
		case 'multipoint':
			return 'Multi-point';
		case 'linestring':
			return 'Line';
		case 'multilinestring':
			return 'Multi-line';
		case 'polygon':
			return 'Polygon';
		case 'multipolygon':
			return 'Multi-polygon';
		case 'geometrycollection':
			return 'Geometry collection';
		default:
			return value.trim() === '' ? 'Unknown' : value;
	}
}
