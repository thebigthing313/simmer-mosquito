import type { CommentRow, InspectionRow, LarvalDensity, SampleRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
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
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/larval-surveillance/inspections' });
		}
	},
	component: CreateInspectionRoute,
});

const warmGcTimeMs = 30_000;

function CreateInspectionRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const workspace = useOrganizationWorkspace(auth.snapshot);
	const { organization, settings } = workspace;
	const { rows: habitatTypes } = useCollectionRows(webCollections.habitatTypes);
	const { rows: profiles } = useCollectionRows(webCollections.profiles);

	const today = useMemo(() => todayInTimeZone(undefined), []);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;
	const policy = settings.larvalSurveillance.inspectionEntryPolicy;

	// Minted up front so the crew rows can be written the moment the inspection
	// lands — and so their on-demand stream is already warm when the save fires.
	const [inspectionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'inspection', id: inspectionId });
	// Same reason: samples sync on demand, and a write against a cold stream times
	// out waiting for its txid confirmation.
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

	const onSave = useCallback(
		async ({
			values,
			adhocGeometry,
		}: {
			readonly values: InspectionFormValues;
			readonly adhocGeometry: DrawGeometry | null;
		}) => {
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
			});

			const transaction =
				isAdhoc && adhocGeometry !== null
					? webCollections.inspections.insert(row, {
							metadata: { locationSource: { kind: 'geometry', geometry: adhocGeometry } },
						})
					: webCollections.inspections.insert(row);
			await settleWrite(transaction);

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

			await navigate({
				to: '/larval-surveillance/inspections/$id',
				params: { id: row.id },
			});
		},
		[organization, actorProfileId, inspectionId, navigate],
	);

	return (
		<InspectionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultInspectionFormValues(today, actorProfileId)}
			habitatTypes={habitatTypes}
			mode="create"
			header={{
				title: 'Record inspection',
				description: 'Log a larval inspection against a habitat or an ad-hoc field location.',
				backTo: '/larval-surveillance/inspections',
				backLabel: 'Inspections',
			}}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			policy={policy}
			profiles={profiles}
			submitLabel="Record inspection"
		/>
	);
}

function buildInspectionRow(
	values: InspectionFormValues,
	context: {
		readonly id: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly now: string;
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
