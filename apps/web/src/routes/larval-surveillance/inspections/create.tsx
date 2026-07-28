import type { CommentRow, InspectionRow, LarvalDensity } from '@simmer-mosquito/sync';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { todayInTimeZone } from '../-overview-data';
import {
	type DrawGeometry,
	defaultInspectionFormValues,
	InspectionFormPage,
	type InspectionFormValues,
	noHabitatTypeValue,
	unsetDensityValue,
} from './-inspection-form';

export const Route = createFileRoute('/larval-surveillance/inspections/create')({
	component: CreateInspectionRoute,
});

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
	const entryMode = settings.larvalSurveillance.inspectionEntryPolicy.mode;

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
		[organization, actorProfileId, navigate],
	);

	return (
		<InspectionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultInspectionFormValues(today)}
			entryMode={entryMode}
			habitatTypes={habitatTypes}
			header={{
				title: 'Record inspection',
				description: 'Log a larval inspection against a habitat or an ad-hoc field location.',
				backTo: '/larval-surveillance/inspections',
				backLabel: 'Inspections',
			}}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record inspection"
		/>
	);
}

function buildInspectionRow(
	values: InspectionFormValues,
	context: {
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
		id: crypto.randomUUID(),
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
	try {
		await settleWrite(webCollections.comments.insert(comment));
	} catch {
		// Best-effort: the inspection is already saved, and the comment can be added
		// from its detail page. Don't block navigation on a comment failure.
	}
}
