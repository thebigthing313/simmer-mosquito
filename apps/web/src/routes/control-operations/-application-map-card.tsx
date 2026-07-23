import type {
	ApplicationBatchRow,
	ApplicationRow,
	ControlMethodRow,
	InsecticideBatchRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { coordinateLabel, MapCard, MapCardFact } from '../../components/map/map-card';
import { webCollections } from '../../sync/webCollections';
import { formatActionDate, formatAmount } from './-control-display';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The map focus card for a chemical application. Resolves the application off the
 * on-demand collection, its product / method / unit / applicator off the eager
 * lookups, and its batch labels by joining `application_batches` to the product's
 * `insecticide_batches`, then renders the shared {@link MapCard}.
 */
export function ApplicationMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const applicationResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ application: webCollections.applications })
					.where(({ application }) => eq(application.id, id))
					.findOne(),
		},
		[id],
	);
	const application = applicationResult.data as ApplicationRow | undefined;

	const insecticideId = application?.insecticideId ?? UNMATCHABLE_ID;
	const productResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ insecticide: webCollections.insecticides })
					.where(({ insecticide }) => eq(insecticide.id, insecticideId))
					.findOne(),
		},
		[insecticideId],
	);
	const product = productResult.data as InsecticideRow | undefined;

	const methodId = application?.applicationMethodId ?? UNMATCHABLE_ID;
	const methodResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ method: webCollections.applicationMethods })
					.where(({ method }) => eq(method.id, methodId))
					.findOne(),
		},
		[methodId],
	);
	const method = methodResult.data as ControlMethodRow | undefined;

	const unitId = application?.applicationUnitId ?? UNMATCHABLE_ID;
	const unitResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ unit: webCollections.units })
					.where(({ unit }) => eq(unit.id, unitId))
					.findOne(),
		},
		[unitId],
	);
	const unit = unitResult.data as UnitRow | undefined;

	const applicatorId = application?.applicatorProfileId ?? UNMATCHABLE_ID;
	const applicatorResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ profile: webCollections.profiles })
					.where(({ profile }) => eq(profile.id, applicatorId))
					.findOne(),
		},
		[applicatorId],
	);
	const applicator = applicatorResult.data as ProfileRow | undefined;

	const entriesResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ batch: webCollections.applicationBatches })
					.where(({ batch }) => eq(batch.applicationId, id)),
		},
		[id],
	);
	const entries = (entriesResult.data ?? []) as readonly ApplicationBatchRow[];
	const productBatchesResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ batch: webCollections.insecticideBatches })
					.where(({ batch }) => eq(batch.insecticideId, insecticideId)),
		},
		[insecticideId],
	);
	const batchNameById = useMemo(
		() =>
			new Map(
				(productBatchesResult.data ?? []).map((batch) => [
					batch.id,
					(batch as InsecticideBatchRow).batchName,
				]),
			),
		[productBatchesResult.data],
	);
	const batchNames = useMemo(
		() =>
			entries.flatMap((entry) => {
				const name = batchNameById.get(entry.insecticideBatchId);
				return name === undefined ? [] : [name];
			}),
		[entries, batchNameById],
	);

	if (application === undefined) {
		return (
			<MapCard onClose={onClose} title="Application">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const productName = product?.tradeName ?? 'Unknown product';
	const methodName =
		application.applicationMethodId === null ? null : (method?.name ?? 'Unknown method');
	const amount = formatAmount(application.amountApplied, unit);
	const applicatorName =
		application.applicatorProfileId === null ? null : (applicator?.displayName ?? null);

	return (
		<MapCard
			onClose={onClose}
			subtitle={`${amount} · ${formatActionDate(application.applicationDate)}`}
			title={productName}
			viewDetailLink={(content) => (
				<Link params={{ id: application.id }} to="/control-operations/chemical/$id">
					{content}
				</Link>
			)}
		>
			<dl className="grid grid-cols-2 gap-2 text-xs">
				<MapCardFact label="Method" value={methodName ?? 'No method'} />
				{applicatorName === null ? null : <MapCardFact label="Applicator" value={applicatorName} />}
				{batchNames.length === 0 ? null : (
					<MapCardFact label="Batches" value={batchNames.join(', ')} wide />
				)}
				<MapCardFact label="Coordinates" value={coordinateLabel(application)} wide />
			</dl>
		</MapCard>
	);
}
