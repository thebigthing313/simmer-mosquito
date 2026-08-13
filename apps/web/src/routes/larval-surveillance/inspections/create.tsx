import type { CommentRow, InspectionRow, LarvalDensity, SampleRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { assignmentStopSearchSchema } from '../../../lib/assignment-stop-search';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import { todayInTimeZone } from '../-overview-data';
import {
	type DrawGeometry,
	defaultInspectionFormValues,
	InspectionFormPage,
	type InspectionFormValues,
	type InspectionSampleDraft,
	noHabitatTypeValue,
	unsetDensityValue,
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
					.from({ sample: webCollections.samples })
					.where(({ sample }) => eq(sample.inspectionId, inspectionId)),
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
	const workspace = useOrganizationWorkspace(auth.snapshot);
	const { organization, settings } = workspace;
	const { rows: habitatTypes } = useCollectionRows(webCollections.habitatTypes);
	const { rows: profiles } = useCollectionRows(webCollections.profiles);

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
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite();

	const onSave = useCallback(
		async (input: {
			readonly values: InspectionFormValues;
			readonly adhocGeometry: DrawGeometry | null;
		}) =>
			runAcknowledged(async (acknowledgements) => {
				const { values, adhocGeometry } = input;
				if (organization === null) {
					throw new Error('Organization details are still loading.');
				}
				if (actorProfileId === null) {
					throw new Error('Your profile is still loading.');
				}

				const now = new Date().toISOString();
				const isAdhoc = values.locationMode === 'adhoc';
				const row = buildInspectionRow(values, {
					id: inspectionId,
					organizationId: organization.id,
					actorProfileId,
					now,
					assignmentItemId,
				});

				await settleWrite(
					webCollections.inspections.insert(row, {
						metadata: {
							acknowledgements,
							...(isAdhoc && adhocGeometry !== null
								? { locationSource: { kind: 'geometry', geometry: adhocGeometry } }
								: {}),
						},
					}),
				);

				// Samples reference the inspection, so they follow it. Best-effort like
				// the crew rows: a sample that fails to land is reported rather than
				// failing a save that already succeeded.
				await attachLinksBestEffort('the samples', () =>
					saveInspectionSamples(values.samples, {
						inspectionId: row.id,
						organizationId: organization.id,
						actorProfileId,
						now,
					}),
				);

				// Crew rows reference the inspection, so they can only be written once it
				// exists.
				await attachLinksBestEffort('the additional personnel', () =>
					saveAdditionalPersonnel({
						target: { type: 'inspection', id: row.id },
						organizationId: organization.id,
						actorProfileId,
						existing: [],
						profileIds: values.additionalPersonnelIds,
					}),
				);

				// Attach the optional note as the inspection's first comment. The
				// inspection must be committed first (the comment references it), so this
				// runs after its persistence — best-effort, so a comment hiccup never
				// strands the user on a saved-but-unnavigated inspection.
				const comment = values.comment.trim();
				if (comment.length > 0) {
					await addInspectionComment(comment, {
						inspectionId: row.id,
						organizationId: organization.id,
						actorProfileId,
						now,
					});
				}

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
					params: { id: row.id },
				});
			}),
		[
			organization,
			actorProfileId,
			inspectionId,
			navigate,
			assignmentItemId,
			assignmentId,
			runAcknowledged,
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

function buildInspectionRow(
	values: InspectionFormValues,
	context: {
		readonly id: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly now: string;
		readonly assignmentItemId: string | null;
	},
): InspectionRow {
	const wet = values.isWet;
	const density =
		wet && values.density !== unsetDensityValue ? (values.density as LarvalDensity) : null;
	const isAdhoc = values.locationMode === 'adhoc';

	return {
		id: context.id,
		organizationId: context.organizationId,
		habitatId: isAdhoc ? null : values.habitatId,
		habitatTypeId:
			isAdhoc && values.habitatTypeId !== noHabitatTypeValue ? values.habitatTypeId : null,
		addressId: isAdhoc ? values.addressId : null,
		inspectedByProfileId: values.inspectedByProfileId,
		assignmentItemId: context.assignmentItemId,
		inspectionDate: values.inspectionDate,
		isWet: wet,
		dipCount: wet ? values.dipCount : null,
		density,
		larvaeCount: wet ? values.larvaeCount : null,
		hasEggs: wet && values.lifeStages.hasEggs,
		hasFirstInstar: wet && values.lifeStages.hasFirstInstar,
		hasSecondInstar: wet && values.lifeStages.hasSecondInstar,
		hasThirdInstar: wet && values.lifeStages.hasThirdInstar,
		hasFourthInstar: wet && values.lifeStages.hasFourthInstar,
		hasPupae: wet && values.lifeStages.hasPupae,
		createdByProfileId: context.actorProfileId,
		updatedByProfileId: context.actorProfileId,
		createdAt: context.now,
		updatedAt: context.now,
	};
}

/**
 * Write the specimens drafted on the form. A blank label records an unlabeled
 * sample — the insert handler sends `displayName: null` and the server picks the
 * unlabeled command.
 */
async function saveInspectionSamples(
	samples: readonly InspectionSampleDraft[],
	context: {
		readonly inspectionId: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly now: string;
	},
): Promise<void> {
	for (const sample of samples) {
		const row: SampleRow = {
			id: sample.id,
			organizationId: context.organizationId,
			inspectionId: context.inspectionId,
			displayName: sample.label.trim() === '' ? null : sample.label.trim(),
			isZeroLarvae: false,
			hasNonMosquito: false,
			unidentifiableReason: null,
			createdByProfileId: context.actorProfileId,
			updatedByProfileId: context.actorProfileId,
			createdAt: context.now,
			updatedAt: context.now,
		};
		// Sequential: the samples stream is on-demand, so the first insert warms it
		// and the rest confirm against a live shape instead of racing a cold one.
		await settleWrite(webCollections.samples.insert(row));
	}
}

async function addInspectionComment(
	commentText: string,
	context: {
		readonly inspectionId: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly now: string;
	},
): Promise<void> {
	const comment: CommentRow = {
		id: crypto.randomUUID(),
		organizationId: context.organizationId,
		entityType: 'inspection',
		entityId: context.inspectionId,
		commentText,
		commentedByProfileId: context.actorProfileId,
		commentedAt: context.now,
		isPinned: false,
		createdByProfileId: context.actorProfileId,
		updatedByProfileId: context.actorProfileId,
		createdAt: context.now,
		updatedAt: context.now,
	};
	// Same bind as the crew rows: the inspection is already saved, so a failed
	// comment cannot fail the save — but the note the user typed is not on the
	// record, so it is reported rather than dropped.
	await attachLinksBestEffort('the note', () =>
		settleWrite(webCollections.comments.insert(comment)),
	);
}
