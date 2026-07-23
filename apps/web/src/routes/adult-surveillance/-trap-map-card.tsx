import type {
	AddressRow,
	CollectionLureRow,
	CollectionMethodRow,
	TrapRow,
} from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { CheckCircle2Icon, CircleIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { coordinateLabel, MapCard, MapCardFact } from '../../components/map/map-card';
import { webCollections } from '../../sync/webCollections';
import { trapDisplayName } from './-adult-display';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The map focus card for a trap. Given the trap id it resolves the trap off the
 * eager baseline collection, its method + lure off the eager lookups, and its
 * address off the on-demand collection, then renders the shared {@link MapCard}.
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

	const addressId = trap?.addressId ?? UNMATCHABLE_ID;
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
	const addressName = trap.addressId === null ? null : (address?.displayName ?? null);

	return (
		<MapCard
			badges={<TrapStatusBadge isActive={trap.isActive} />}
			onClose={onClose}
			subtitle={methodName}
			title={trapDisplayName(trap)}
			viewDetailLink={(content) => (
				<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id">
					{content}
				</Link>
			)}
		>
			<dl className="grid grid-cols-2 gap-2 text-xs">
				<MapCardFact label="Lure" value={lureName ?? 'None'} />
				<MapCardFact label="Address" value={addressName ?? 'No linked address'} wide />
				<MapCardFact label="Coordinates" value={coordinateLabel(trap)} wide />
			</dl>
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
