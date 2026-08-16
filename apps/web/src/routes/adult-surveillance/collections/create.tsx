import type {
	AdultCollectionRow,
	CollectionLureRow,
	CollectionMethodRow,
	TrapRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import type { DrawGeometry } from '../../../components/map/use-map-draw';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { assignmentStopSearchSchema } from '../../../lib/assignment-stop-search';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import { todayInTimeZone } from '../-overview-data';
import {
	CollectionFormPage,
	type CollectionFormValues,
	type CollectionSaveInput,
	defaultCollectionFormValues,
	noLureValue,
	noUnitValue,
} from './-collection-form';
import { type CollectionTimingStamps, collectionTimingStamps } from './-collection-timing';

const createCollectionSearchSchema = z.object({
	...mapPointSearchSchema.shape,
	...assignmentStopSearchSchema.shape,
	/** Optional trap to prefill the source, e.g. from a trap's "Record collection". */
	trapId: z
		.string()
		.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
		.optional()
		.catch(undefined),
});

/**
 * A collection opened from a point on the map is a one-off, not a trap's.
 *
 * The source has to follow the coordinate: left on `trap`, the seeded geometry
 * is held but its control is never rendered, and the point is silently lost on
 * save. An explicit `trapId` still wins — arriving from a trap's "Record
 * collection" says which trap this is, and that is the stronger signal.
 */
function seededDefaults(
	base: CollectionFormValues,
	seed: DrawGeometry | null,
): CollectionFormValues {
	if (seed === null || base.trapId !== null) {
		return base;
	}
	return { ...base, sourceMode: 'adhoc' };
}

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

/** The optimistic row a create writes; the server recomputes geom and links. */
function buildCollectionRow(input: {
	readonly values: CollectionFormValues;
	readonly id: string;
	readonly organizationId: string;
	readonly actorProfileId: string;
	readonly now: string;
	readonly centroid: { readonly lat: number; readonly lng: number };
	readonly isTrap: boolean;
	readonly exact: boolean;
	readonly timing: CollectionTimingStamps;
	readonly assignmentItemId: string | null;
}): AdultCollectionRow {
	const { values, centroid, isTrap, exact, timing, assignmentItemId } = input;
	return {
		id: input.id,
		organizationId: input.organizationId,
		lat: centroid.lat,
		lng: centroid.lng,
		geomType: 'point',
		trapId: isTrap ? values.trapId : null,
		collectionMethodId: values.collectionMethodId,
		collectionLureId: values.collectionLureId === noLureValue ? null : values.collectionLureId,
		addressId: isTrap ? null : values.addressId,
		collectedAt: timing.collectedAt,
		collectedByProfileId: values.collectedByProfileId,
		startedAt: timing.startedAt,
		setByProfileId: values.setByProfileId,
		// Both halves come from this one visit; the server writes whichever
		// applies for the timing mode.
		setAssignmentItemId: assignmentItemId,
		collectedAssignmentItemId: timing.collectedAt === null ? null : assignmentItemId,
		collectionTimingMode: values.timingMode,
		collectionDate: exact ? null : values.collectionDate,
		durationAmount: exact ? null : values.durationAmount,
		durationUnitId: exact || values.durationUnitId === noUnitValue ? null : values.durationUnitId,
		hasProblem: values.hasProblem,
		isZeroResult: false,
		hasBycatch: false,
		metadata: values.metadata,
		createdByProfileId: input.actorProfileId,
		updatedByProfileId: input.actorProfileId,
		createdAt: input.now,
		updatedAt: input.now,
	};
}

function CreateCollectionRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	const { trapId } = search;
	// Recording off a stop makes this one write, not two: the server links the
	// collection to the stop and completes it in the same transaction.
	const assignmentItemId = search.assignmentItemId ?? null;
	const assignmentId = search.assignmentId ?? null;
	const navigate = useNavigate();
	const { organization, settings } = useOrganizationWorkspace(auth.snapshot);
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);
	const profiles = useProfileRoster();
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the collection
	// lands — and so their on-demand stream is already warm when the save fires.
	const [collectionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'collection', id: collectionId });

	// The whole save re-runs on a confirmed acknowledgement, crew rows included;
	// every id is minted up front, so a second attempt writes the same rows.
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite();

	const onSave = useCallback(
		async (input: CollectionSaveInput) =>
			runAcknowledged(async (acknowledgements) => {
				const { values, trap, geometry } = input;
				if (organization === null) {
					throw new Error('Organization details are still loading.');
				}
				if (actorProfileId === null) {
					throw new Error('Your profile is still loading.');
				}

				const isTrap = values.sourceMode === 'trap';
				const exact = values.timingMode === 'exact_timestamps';
				const now = new Date().toISOString();
				const timing = collectionTimingStamps(values, timeZone);

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

				const row = buildCollectionRow({
					values,
					id: collectionId,
					organizationId: organization.id,
					actorProfileId,
					now,
					centroid,
					isTrap,
					exact,
					timing,
					assignmentItemId,
				});

				const locationSource =
					isTrap && trap !== null
						? ({ kind: 'trap', trapId: trap.id } as const)
						: geometry !== null
							? ({ kind: 'geometry', geometry } as const)
							: undefined;
				if (locationSource === undefined) {
					throw new Error('Unable to determine the collection location.');
				}

				await settleWrite(
					webCollections.collections.insert(row, {
						metadata: { acknowledgements, locationSource },
					}),
				);
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
				// Back to the worklist the stop came from, not to the collection: the
				// crew's next move is the next stop.
				if (assignmentId !== null) {
					await navigate({ to: '/operations/assignments/$id', params: { id: assignmentId } });
					return;
				}
				await navigate({ to: '/adult-surveillance/collections/$id', params: { id: row.id } });
			}),
		[
			organization,
			actorProfileId,
			collectionId,
			navigate,
			assignmentItemId,
			assignmentId,
			runAcknowledged,
			timeZone,
		],
	);

	return (
		<>
			<CollectionFormPage
				canSubmit={canSubmit}
				collectionLures={lures}
				collectionMethods={methods}
				defaultValues={seededDefaults(
					defaultCollectionFormValues(
						today,
						trapId ?? null,
						settings.adultSurveillance.collectionTimingMode,
					),
					initialGeometry,
				)}
				header={{
					title: 'Record Collection',
					description: 'Log a collection from a trap or a one-off field location.',
					backTo: '/adult-surveillance/collections',
					backLabel: 'Collections',
				}}
				initialGeometry={initialGeometry}
				onSave={onSave}
				organizationId={organization?.id ?? ''}
				profiles={profiles}
				submitLabel="Record Collection"
				traps={traps}
				units={units}
			/>
			{acknowledgeDialog}
		</>
	);
}
