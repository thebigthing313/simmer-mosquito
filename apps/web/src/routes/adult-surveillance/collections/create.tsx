import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import type { DrawGeometry } from '../../../components/map/use-map-draw';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import {
	type CollectionPlacement,
	useCollectionMutations,
} from '../../../hooks/mutations/use-collection-mutations';
import { useAdditionalPersonnel } from '../../../hooks/queries/use-additional-personnel';
import {
	useCollectionLureRoster,
	useCollectionMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useTrapOptions } from '../../../hooks/queries/use-trap-options';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { assignmentStopSearchSchema } from '../../../lib/assignment-stop-search';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { isWriteBlocked } from '../../../lib/write-access';
import { todayInTimeZone } from '../-overview-data';
import {
	CollectionFormPage,
	type CollectionFormValues,
	type CollectionSaveInput,
	collectionFieldsFrom,
	defaultCollectionFormValues,
} from './-collection-form';

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

function CreateCollectionRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	const { trapId } = search;
	// Recording off a stop makes this one write, not two: the command writes the
	// collection and closes the stop in the same transaction.
	const assignmentItemId = search.assignmentItemId ?? null;
	const assignmentId = search.assignmentId ?? null;
	const navigate = useNavigate();
	const { organization, settings } = useOrganizationWorkspace(auth.snapshot);
	const { traps } = useTrapOptions();
	const methods = useCollectionMethodRoster();
	const lures = useCollectionLureRoster();
	const profiles = useProfileRoster();
	const { all: units } = useUnitLabels();
	const mutations = useCollectionMutations();

	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);

	// Minted up front so the crew rows can be written the moment the collection
	// lands — and so their on-demand stream is already warm when the save fires.
	const [collectionId] = useState(() => newRecordId());
	useAdditionalPersonnel({ type: 'collection', id: collectionId });
	const { setPersonnel } = useAdditionalPersonnelMutations();

	// The whole save re-runs on a confirmed acknowledgement, crew rows included;
	// every id is minted up front, so a second attempt writes the same rows.
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite();

	const onSave = useCallback(
		async (input: CollectionSaveInput) =>
			runAcknowledged(async (acknowledgements) => {
				const { values, trap, geometry } = input;
				const isTrap = values.sourceMode === 'trap';

				// A trap collection inherits the trap's location; an ad hoc one carries
				// its own point. The server snapshots geom from the location source; this
				// centroid seeds the optimistic row so the map shows it immediately.
				const centroid =
					isTrap && trap !== null
						? { lat: trap.latitude, lng: trap.longitude, geomType: 'point' }
						: geometry !== null && geometry.type === 'Point'
							? {
									lat: geometry.coordinates[1],
									lng: geometry.coordinates[0],
									geomType: 'point',
								}
							: null;
				if (centroid === null) {
					throw new Error('Unable to determine the collection location.');
				}

				const placement = placementFor({
					assignmentItemId,
					trapId: isTrap && trap !== null ? trap.id : null,
					geometry: isTrap ? null : geometry,
				});

				const fields = collectionFieldsFrom(values, timeZone);
				await mutations.record({
					collectionId,
					fields,
					placement,
					centroid,
					// Whether the trap has already been emptied. The route this replaces
					// left the server to work this out from whether a `collectedAt` had
					// arrived, which made a stray timestamp turn a trap being left out into
					// a finished record.
					isCollected: fields.timing.collectedAt !== null,
					acknowledgements,
				});

				// Crew rows reference the collection, so they can only be written once it
				// exists.
				await attachLinksBestEffort('the additional personnel', () =>
					setPersonnel({
						target: { type: 'collection', id: collectionId },
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
				await navigate({ to: '/adult-surveillance/collections/$id', params: { id: collectionId } });
			}),
		[
			collectionId,
			navigate,
			assignmentItemId,
			assignmentId,
			runAcknowledged,
			timeZone,
			setPersonnel,
			mutations,
		],
	);

	return (
		<>
			<CollectionFormPage
				canSubmit={mutations.canWrite}
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

/**
 * Which of the three recordings this save is.
 *
 * A stop wins over both: there is no ad hoc stop command, because a stop already
 * names the trap it was dispatched for, and the trap the form chose rides along
 * only so an override can disagree with it deliberately.
 */
function placementFor(input: {
	readonly assignmentItemId: string | null;
	readonly trapId: string | null;
	readonly geometry: DrawGeometry | null;
}): CollectionPlacement {
	if (input.assignmentItemId !== null) {
		return {
			kind: 'stop',
			assignmentItemId: input.assignmentItemId,
			trapId: input.trapId,
		};
	}
	if (input.trapId !== null) {
		return { kind: 'trap', trapId: input.trapId };
	}
	if (input.geometry === null) {
		throw new Error('Unable to determine the collection location.');
	}
	return { kind: 'adhoc', geometry: input.geometry as unknown as GeoJsonGeometry };
}
