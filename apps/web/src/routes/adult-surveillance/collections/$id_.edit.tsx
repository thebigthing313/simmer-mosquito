import type {
	AdultCollectionRow,
	CollectionLureRow,
	CollectionMethodRow,
	ProfileRow,
	TrapRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import {
	type AdditionalPersonnelResult,
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	CollectionFormPage,
	type CollectionFormValues,
	type CollectionSaveInput,
	noLureValue,
	noUnitValue,
} from './-collection-form';

const collectionGcTimeMs = 30_000;

export const Route = createFileRoute('/adult-surveillance/collections/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/adult-surveillance/collections/$id',
			});
		}
	},
	component: EditCollectionRoute,
});

function EditCollectionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	// collections is on-demand; status-gated useLiveQuery (not suspense) avoids the
	// post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: collectionGcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => eq(collection.id, id))
					.findOne(),
		},
		[id],
	);
	const collection = result.data as AdultCollectionRow | undefined;

	if (result.isError) {
		return <EditUnavailable description="This collection could not be loaded." />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (collection === undefined) {
		return (
			<EditUnavailable description="This collection could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditCollectionLoader
			actorProfileId={actorProfileId}
			canSubmit={organization !== null && actorProfileId !== null}
			collection={collection}
			collectionLures={lures}
			collectionMethods={methods}
			profiles={profiles}
			traps={traps}
			units={units}
		/>
	);
}

function EditCollectionLoader({
	collection,
	traps,
	collectionMethods,
	collectionLures,
	profiles,
	units,
	actorProfileId,
	canSubmit,
}: {
	readonly collection: AdultCollectionRow;
	readonly traps: readonly TrapRow[];
	readonly collectionMethods: readonly CollectionMethodRow[];
	readonly collectionLures: readonly CollectionLureRow[];
	readonly profiles: readonly ProfileRow[];
	readonly units: readonly UnitRow[];
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'collection', id: collection.id });

	const onSave = useCallback(
		async ({ values, geometry, geometryChanged }: CollectionSaveInput) => {
			const exact = values.timingMode === 'exact_timestamps';
			// Location edits only apply to ad-hoc collections; trap-based ones inherit
			// their trap's location and address.
			const isAdhoc = collection.trapId === null;
			const refinedPoint =
				isAdhoc && geometryChanged && geometry !== null && geometry.type === 'Point';
			const locationSource = refinedPoint ? ({ kind: 'geometry', geometry } as const) : undefined;

			const now = new Date().toISOString();
			const applyEdits = (draft: AdultCollectionRow) => {
				const writable = draft as {
					-readonly [K in keyof AdultCollectionRow]: AdultCollectionRow[K];
				};
				writable.collectionMethodId = values.collectionMethodId;
				writable.collectionLureId =
					values.collectionLureId === noLureValue ? null : values.collectionLureId;
				writable.setByProfileId = values.setByProfileId;
				writable.collectedByProfileId = values.collectedByProfileId;
				writable.hasProblem = values.hasProblem;
				writable.metadata = values.metadata;
				writable.collectionTimingMode = values.timingMode;
				writable.startedAt = exact ? toIsoDate(values.startedAt) : null;
				writable.collectedAt = exact
					? toIsoDate(values.collectedAt)
					: toIsoDate(values.collectionDate);
				writable.collectionDate = exact ? null : values.collectionDate;
				writable.durationAmount = exact ? null : values.durationAmount;
				writable.durationUnitId =
					exact || values.durationUnitId === noUnitValue ? null : values.durationUnitId;
				if (isAdhoc) {
					writable.addressId = values.addressId;
				}
				if (refinedPoint && geometry.type === 'Point') {
					writable.lat = geometry.coordinates[1];
					writable.lng = geometry.coordinates[0];
					writable.geomType = 'point';
				}
				if (actorProfileId !== null) {
					writable.updatedByProfileId = actorProfileId;
				}
				writable.updatedAt = now;
			};

			const transaction =
				locationSource === undefined
					? webCollections.collections.update(collection.id, applyEdits)
					: webCollections.collections.update(
							collection.id,
							{ metadata: { locationSource } },
							applyEdits,
						);
			await settleWrite(transaction);
			await saveAdditionalPersonnel({
				target: { type: 'collection', id: collection.id },
				organizationId: collection.organizationId,
				actorProfileId,
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({
				to: '/adult-surveillance/collections/$id',
				params: { id: collection.id },
			});
		},
		[
			collection.id,
			collection.organizationId,
			collection.trapId,
			actorProfileId,
			personnel.rows,
			navigate,
		],
	);

	if (personnel.isError) {
		return <EditUnavailable description="This collection's personnel could not be loaded." />;
	}
	if (!personnel.isReady) {
		return <EditFormSkeleton />;
	}

	return (
		<CollectionFormPage
			canSubmit={canSubmit}
			collectionLures={collectionLures}
			collectionMethods={collectionMethods}
			defaultValues={defaultsFromCollection(collection, personnel)}
			header={{
				title: 'Edit Collection',
				description: 'Update this collection’s method, timing, personnel, location, or result.',
				backTo: '/adult-surveillance/collections/$id',
				backParams: { id: collection.id },
				backLabel: 'Back to collection',
			}}
			initialGeometry={
				collection.trapId === null
					? { type: 'Point', coordinates: [collection.lng, collection.lat] }
					: null
			}
			lockSourceMode
			onSave={onSave}
			organizationId={collection.organizationId}
			profiles={profiles}
			submitLabel="Save changes"
			traps={traps}
			units={units}
		/>
	);
}

function defaultsFromCollection(
	collection: AdultCollectionRow,
	personnel: AdditionalPersonnelResult,
): CollectionFormValues {
	return {
		sourceMode: collection.trapId === null ? 'adhoc' : 'trap',
		trapId: collection.trapId,
		addressId: collection.addressId,
		collectionMethodId: collection.collectionMethodId,
		collectionLureId: collection.collectionLureId ?? noLureValue,
		timingMode: collection.collectionTimingMode,
		startedAt: toDateOnly(collection.startedAt),
		collectedAt: toDateOnly(collection.collectedAt),
		collectionDate: collection.collectionDate,
		durationAmount: collection.durationAmount,
		durationUnitId: collection.durationUnitId ?? noUnitValue,
		setByProfileId: collection.setByProfileId,
		collectedByProfileId: collection.collectedByProfileId,
		additionalPersonnelIds: personnel.profileIds,
		hasProblem: collection.hasProblem,
		metadata: asMetadataValue(collection.metadata),
	};
}

/** Reduce an ISO timestamp (or bare date) to its `YYYY-MM-DD` calendar day. */
function toDateOnly(value: string | null): string | null {
	return value === null ? null : value.slice(0, 10);
}

/** Convert a `YYYY-MM-DD` to an ISO timestamp at UTC noon (avoids day-shift). */
function toIsoDate(date: string | null): string | null {
	if (date === null || date.length < 10) {
		return null;
	}
	return `${date.slice(0, 10)}T12:00:00.000Z`;
}

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
				<Skeleton className="h-24 w-full" />
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}

function EditUnavailable({ description }: { readonly description: string }) {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-8">
			<Empty className="max-w-md border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>Collection Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
