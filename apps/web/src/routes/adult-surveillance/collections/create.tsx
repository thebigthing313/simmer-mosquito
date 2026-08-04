import type {
	AdultCollectionRow,
	CollectionLureRow,
	CollectionMethodRow,
	ProfileRow,
	TrapRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { isWriteBlocked } from '../../../lib/write-access';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { todayInTimeZone } from '../-overview-data';
import {
	CollectionFormPage,
	type CollectionSaveInput,
	defaultCollectionFormValues,
	noLureValue,
	noUnitValue,
} from './-collection-form';

const createCollectionSearchSchema = z.object({
	/** Optional trap to prefill the source, e.g. from a trap's "Record collection". */
	trapId: z
		.string()
		.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
		.optional()
		.catch(undefined),
});

export const Route = createFileRoute('/adult-surveillance/collections/create')({
	// After `validateSearch`: the options object is read in order, and a
	// `beforeLoad` declared ahead of it is typed against a route whose search
	// schema is not known yet — which erases `trapId` from `Route.useSearch()`.
	validateSearch: (search) => createCollectionSearchSchema.parse(search),
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/adult-surveillance/collections' });
		}
	},
	component: CreateCollectionRoute,
});

function CreateCollectionRoute() {
	const { auth } = Route.useRouteContext();
	const { trapId } = Route.useSearch();
	const navigate = useNavigate();
	const { organization, settings } = useOrganizationWorkspace(auth.snapshot);
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	const today = useMemo(() => todayInTimeZone(undefined), []);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the collection
	// lands — and so their on-demand stream is already warm when the save fires.
	const [collectionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'collection', id: collectionId });

	const onSave = useCallback(
		async ({ values, trap, geometry }: CollectionSaveInput) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const isTrap = values.sourceMode === 'trap';
			const exact = values.timingMode === 'exact_timestamps';
			const now = new Date().toISOString();
			const collectedAt = exact ? toIsoDate(values.collectedAt) : toIsoDate(values.collectionDate);

			// Trap mode inherits the trap's location; ad-hoc carries its own point. The
			// server recomputes geom from the location source; this centroid seeds the
			// optimistic row so the map/coordinates show immediately.
			const centroid =
				isTrap && trap !== null
					? { lat: trap.lat, lng: trap.lng }
					: geometry !== null && geometry.type === 'Point'
						? { lat: geometry.coordinates[1], lng: geometry.coordinates[0] }
						: null;
			if (centroid === null) {
				throw new Error('Unable to determine the collection location.');
			}

			const row: AdultCollectionRow = {
				id: collectionId,
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: 'point',
				trapId: isTrap ? values.trapId : null,
				collectionMethodId: values.collectionMethodId,
				collectionLureId: values.collectionLureId === noLureValue ? null : values.collectionLureId,
				addressId: isTrap ? null : values.addressId,
				collectedAt,
				collectedByProfileId: values.collectedByProfileId,
				startedAt: exact ? toIsoDate(values.startedAt) : null,
				setByProfileId: values.setByProfileId,
				collectionTimingMode: values.timingMode,
				collectionDate: exact ? null : values.collectionDate,
				durationAmount: exact ? null : values.durationAmount,
				durationUnitId:
					exact || values.durationUnitId === noUnitValue ? null : values.durationUnitId,
				hasProblem: values.hasProblem,
				isZeroResult: false,
				hasBycatch: false,
				metadata: values.metadata,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};

			const locationSource =
				isTrap && trap !== null
					? ({ kind: 'trap', trapId: trap.id } as const)
					: geometry !== null
						? ({ kind: 'geometry', geometry } as const)
						: undefined;
			if (locationSource === undefined) {
				throw new Error('Unable to determine the collection location.');
			}

			const transaction = webCollections.collections.insert(row, {
				metadata: { locationSource },
			});
			await settleWrite(transaction);
			// Crew rows reference the collection, so they can only be written once it
			// exists.
			await attachLinksBestEffort('the additional personnel', () =>
				saveAdditionalPersonnel({
					target: { type: 'collection', id: row.id },
					organizationId: organization.id,
					actorProfileId,
					existing: [],
					profileIds: values.additionalPersonnelIds,
				}),
			);
			await navigate({ to: '/adult-surveillance/collections/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, collectionId, navigate],
	);

	return (
		<CollectionFormPage
			canSubmit={canSubmit}
			collectionLures={lures}
			collectionMethods={methods}
			defaultValues={defaultCollectionFormValues(
				today,
				trapId ?? null,
				settings.adultSurveillance.collectionTimingMode,
			)}
			header={{
				title: 'Record collection',
				description: 'Log a collection from a trap or a one-off field location.',
				backTo: '/adult-surveillance/collections',
				backLabel: 'Collections',
			}}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record collection"
			traps={traps}
			units={units}
		/>
	);
}

/** Convert a `YYYY-MM-DD` to an ISO timestamp at UTC noon (avoids day-shift). */
function toIsoDate(date: string | null): string | null {
	if (date === null || date.length < 10) {
		return null;
	}
	return `${date.slice(0, 10)}T12:00:00.000Z`;
}
