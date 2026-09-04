import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useRecordExtras } from '../../../forms/record-extras';
import { useInspectionMutations } from '../../../hooks/mutations/use-inspection-mutations';
import { useSampleMutations } from '../../../hooks/mutations/use-sample-mutations';
import { useAdditionalPersonnel } from '../../../hooks/queries/use-additional-personnel';
import { useHabitatTypeRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { STOP_RECORD_REFUSALS } from '../../../lib/acknowledgement-copy';
import { assignmentStopSearchSchema } from '../../../lib/assignment-stop-search';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { samples } from '../../../lib/collections/samples';
import { isWriteBlocked } from '../../../lib/write-access';
import { todayInTimeZone } from '../-overview-data';
import {
	type DrawGeometry,
	defaultInspectionFormValues,
	InspectionFormPage,
	type InspectionFormValues,
	inspectionResultOf,
	noHabitatTypeValue,
} from './-inspection-form';

export const Route = createFileRoute('/larval-surveillance/inspections/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...assignmentStopSearchSchema.parse(search),
		...inspectionSeedSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/larval-surveillance/inspections' });
		}
	},
	component: CreateInspectionRoute,
});

const warmGcTimeMs = 30_000;

/**
 * The habitat to open the form on, the counterpart of the collection form's
 * `trapId`.
 *
 * A stop names the habitat the inspector was sent to, so arriving from one
 * should not ask them to find it again — and a wrong pick is not a typo here,
 * it is a target mismatch the server has to be told to accept.
 */
const inspectionSeedSearchSchema = z.object({
	habitatId: z.uuid().optional().catch(undefined),
});

/**
 * An inspection opened from a point on the map is an ad-hoc one.
 *
 * The mode has to follow the coordinate: left on `habitat`, the seeded geometry
 * is held but never shown, and the operator draws the same spot a second time.
 */
function seededDefaults(
	base: InspectionFormValues,
	seed: DrawGeometry | null,
	habitatId: string | null,
): InspectionFormValues {
	// A named habitat wins over a seeded point, the way the collection form lets
	// an explicit `trapId` beat one: the stop is the stronger signal about what
	// this inspection is for.
	if (habitatId !== null) {
		return { ...base, locationMode: 'habitat', habitatId };
	}
	return seed === null ? base : { ...base, locationMode: 'adhoc' };
}

/**
 * The id a not-yet-saved inspection will be written under, with its on-demand
 * streams already warm.
 *
 * Minted up front so the samples, crew, and comment can be written the moment
 * the inspection lands, and so their streams are live before the save fires — a
 * write against a cold stream times out waiting for its txid confirmation.
 */
function useNewInspectionDraft(): string {
	const [inspectionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'inspection', id: inspectionId });
	useLiveQuery(
		{
			gcTime: warmGcTimeMs,
			query: (query) =>
				query
					.from({ sample: samples() })
					.where(({ sample }) => eq(sample.inspection_id, inspectionId)),
		},
		[inspectionId],
	);
	return inspectionId;
}

function CreateInspectionRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	// Recording off a stop makes this one write, not two: the server links the
	// inspection to the stop and completes it in the same transaction.
	const assignmentItemId = search.assignmentItemId ?? null;
	const assignmentId = search.assignmentId ?? null;
	const navigate = useNavigate();
	const recordExtras = useRecordExtras();
	const inspectionMutations = useInspectionMutations();
	const sampleMutations = useSampleMutations();
	const workspace = useOrganizationWorkspace(auth.snapshot);
	const { organization, settings } = workspace;
	const habitatTypes = useHabitatTypeRoster();
	const profiles = useProfileRoster();

	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;
	const policy = settings.larvalSurveillance.inspectionEntryPolicy;

	const inspectionId = useNewInspectionDraft();

	// The whole save is the unit an acknowledgement re-runs, not just the insert:
	// the samples, crew, and comment below only exist once the inspection lands,
	// so a confirmed retry has to carry them too. Every id is minted up front, so
	// running twice writes the same rows rather than a second set.
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite({
		askable: STOP_RECORD_REFUSALS,
		ask: true,
	});

	const onSave = useCallback(
		async (input: {
			readonly values: InspectionFormValues;
			readonly adhocGeometry: DrawGeometry | null;
			readonly habitatGeometry: GeoJsonGeometry | null;
		}) =>
			runAcknowledged(async (acknowledgements) => {
				const { values, adhocGeometry, habitatGeometry } = input;
				const isAdhoc = values.locationMode === 'adhoc';

				// The shape the server will snapshot: the drawn one for an ad hoc
				// inspection, the habitat's own for the other two. Reduced here so the
				// optimistic row carries the centroid the map card will read.
				const shape = isAdhoc
					? ((adhocGeometry ?? null) as GeoJsonGeometry | null)
					: habitatGeometry;
				const centroid = shape === null ? null : ownedCentroidFromGeoJson(shape);
				if (centroid === null) {
					throw new Error('Unable to determine the inspection location.');
				}

				await inspectionMutations.record({
					inspectionId,
					result: inspectionResultOf(values),
					placement: isAdhoc
						? {
								kind: 'adhoc',
								geometry: shape as GeoJsonGeometry,
								addressId: values.addressId,
								habitatTypeId:
									values.habitatTypeId === noHabitatTypeValue ? null : values.habitatTypeId,
							}
						: assignmentItemId !== null
							? { kind: 'stop', assignmentItemId, habitatId: null }
							: { kind: 'habitat', habitatId: values.habitatId ?? '' },
					centroid,
					acknowledgements,
				});

				// Samples reference the inspection, so they follow it. Best-effort like
				// the crew rows: a sample that fails to land is reported rather than
				// failing a save that already succeeded.
				await attachLinksBestEffort('the samples', async () => {
					for (const sample of values.samples) {
						const label = sample.label.trim();
						// Sequential: the samples stream is on-demand, so the first insert
						// warms it and the rest confirm against a live shape instead of
						// racing a cold one.
						await sampleMutations.add({
							sampleId: sample.id,
							inspectionId,
							displayName: label === '' ? null : label,
						});
					}
				});

				// Crew rows reference the inspection, so they can only be written once it
				// exists.
				await recordExtras.attach({
					target: { type: 'inspection', id: inspectionId },
					profileIds: values.additionalPersonnelIds,
					commentText: values.comment,
				});

				// Back to the worklist the stop came from, not to the inspection: the
				// crew's next move is the next stop.
				if (assignmentId !== null) {
					await navigate({
						to: '/operations/assignments/$id',
						params: { id: assignmentId },
					});
					return;
				}

				await navigate({
					to: '/larval-surveillance/inspections/$id',
					params: { id: inspectionId },
				});
			}),
		[
			inspectionId,
			navigate,
			assignmentItemId,
			assignmentId,
			runAcknowledged,
			recordExtras,
			inspectionMutations,
			sampleMutations,
		],
	);

	return (
		<>
			<InspectionFormPage
				canSubmit={canSubmit}
				defaultValues={seededDefaults(
					defaultInspectionFormValues(today, actorProfileId),
					initialGeometry,
					search.habitatId ?? null,
				)}
				habitatTypes={habitatTypes}
				mode="create"
				header={{
					title: 'Record Inspection',
					description: 'Log a larval inspection against a habitat or an ad-hoc field location.',
					backTo: '/larval-surveillance/inspections',
					backLabel: 'Inspections',
				}}
				initialAdhocGeometry={initialGeometry}
				onSave={onSave}
				organizationId={organization?.id ?? ''}
				policy={policy}
				profiles={profiles}
				submitLabel="Record Inspection"
			/>
			{acknowledgeDialog}
		</>
	);
}
