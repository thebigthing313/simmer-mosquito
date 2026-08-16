import type { CollectionLureRow, CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	CheckCircle2Icon,
	CircleIcon,
	iconRegistry,
	LocateFixedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { MapCardAddressById } from '../../components/linked-address';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../components/map/map-card';
import { TagBadge } from '../../components/tag-badge';
import { useRecordTags } from '../../hooks/queries/use-record-tags';
import { webCollections } from '../../sync/webCollections';
import { trapDisplayName } from './-adult-display';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const TrapEntityIcon = iconRegistry.entities.trap.icon;

/**
 * The map focus card for a trap. Given the trap id it resolves the trap off the
 * eager baseline collection, its method + lure off the eager lookups, its address
 * off the on-demand collection, and its tags off the eager catalog, then renders
 * the shared {@link MapCard}.
 */
export function TrapMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const trapResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ trap: webCollections.traps })
					.where(({ trap }) => eq(trap.id, id))
					.findOne(),
		},
		[id],
	);
	const trap = trapResult.data as TrapRow | undefined;

	const methodId = trap?.collectionMethodId ?? UNMATCHABLE_ID;
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

	const lureId = trap?.collectionLureId ?? UNMATCHABLE_ID;
	const lureResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ lure: webCollections.collectionLures })
					.where(({ lure }) => eq(lure.id, lureId))
					.findOne(),
		},
		[lureId],
	);
	const lure = lureResult.data as CollectionLureRow | undefined;

	const tags = useRecordTags(id);

	if (trap === undefined) {
		return (
			<MapCard onClose={onClose} title="Trap">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const methodName = method?.name ?? 'Unknown method';
	const lureName = trap.collectionLureId === null ? null : (lure?.name ?? 'Unknown lure');

	return (
		<MapCard
			badges={
				<>
					<TrapStatusBadge isActive={trap.isActive} />
					{tags.map((tag) => (
						<TagBadge key={tag.id} tag={tag} />
					))}
				</>
			}
			eyebrow={<MapCardEyebrow type="Trap" />}
			onClose={onClose}
			title={trapDisplayName(trap)}
			viewDetailLink={(content) => (
				<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={TrapEntityIcon}>
					{methodName}
					{lureName === null ? '' : ` · ${lureName} lure`}
				</MapCardDetail>
				<MapCardAddressById addressId={trap.addressId} />
				<MapCardDetail icon={LocateFixedIcon} mono>
					{coordinateLabel(trap)}
				</MapCardDetail>
			</div>
		</MapCard>
	);
}

function TrapStatusBadge({ isActive }: { readonly isActive: boolean }) {
	return isActive ? (
		<Badge tone="success" variant="outline">
			<CheckCircle2Icon aria-hidden="true" />
			Active
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			<CircleIcon aria-hidden="true" />
			Inactive
		</Badge>
	);
}
