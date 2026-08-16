import type { ControlMethodRow, SourceReductionRow, UnitRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useMissionStopExecution } from '../../../components/mission-stop-execution';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	defaultSourceReductionFormValues,
	noTechnicianValue,
	SourceReductionFormPage,
	type SourceReductionSaveInput,
} from './-source-reduction-form';

export const Route = createFileRoute('/control-operations/source-reduction/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...missionStopSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/control-operations/source-reduction' });
		}
	},
	component: CreateSourceReductionRoute,
});

function CreateSourceReductionRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	// Recorded off a mission stop: the server links the action to the stop and
	// completes it in the same transaction.
	const mission = useMissionStopExecution(search);
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(
		webCollections.sourceReductionMethods,
	);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const profiles = useProfileRoster();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the action lands
	// — and so their on-demand stream is already warm when the save fires.
	const [sourceReductionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'sourceReduction', id: sourceReductionId });

	const onSave = useCallback(
		async (input: SourceReductionSaveInput) =>
			mission.run(async (acknowledgements) => {
				const { values, geometry } = input;
				if (organization === null) {
					throw new Error('Organization details are still loading.');
				}
				if (actorProfileId === null) {
					throw new Error('Your profile is still loading.');
				}
				if (values.sourcesEliminatedAmount === null) {
					throw new Error('Enter how many sources were eliminated.');
				}

				// The point is the action's authoritative geometry; the address and habitat
				// (if any) are reference only. Off a mission stop it is required; on one it
				// is an override the crew may not have drawn, and the server falls back to
				// the stop's own ground.
				const location = mission.resolveLocation(geometry, {
					missing: 'Place the point where the sources were eliminated.',
					unresolvable: 'Unable to determine the source reduction location.',
				});

				const now = new Date().toISOString();
				const row: SourceReductionRow = {
					id: sourceReductionId,
					organizationId: organization.id,
					lat: location.lat,
					lng: location.lng,
					geomType: location.geomType,
					sourceReductionMethodId: values.sourceReductionMethodId,
					technicianProfileId:
						values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
					sourceReductionDate: values.sourceReductionDate,
					addressId: values.addressId,
					habitatId: values.habitatId,
					sourcesEliminatedAmount: values.sourcesEliminatedAmount,
					sourcesEliminatedUnitId: values.sourcesEliminatedUnitId,
					inspectionId: null,
					requestedControlActionId: null,
					missionItemId: mission.missionItemId,
					metadata: values.metadata,
					createdByProfileId: actorProfileId,
					updatedByProfileId: actorProfileId,
					createdAt: now,
					updatedAt: now,
				};

				await settleWrite(
					webCollections.sourceReductions.insert(row, {
						metadata: { acknowledgements, locationSource: location.locationSource },
					}),
				);
				// Crew rows reference the action, so they can only be written once it exists.
				await attachLinksBestEffort('the additional personnel', () =>
					saveAdditionalPersonnel({
						target: { type: 'sourceReduction', id: row.id },
						organizationId: organization.id,
						actorProfileId,
						existing: [],
						profileIds: values.additionalPersonnelIds,
					}),
				);
				await mission.navigateAfterSave(async () => {
					await navigate({
						to: '/control-operations/source-reduction/$id',
						params: { id: row.id },
					});
				});
			}),
		[organization, actorProfileId, sourceReductionId, navigate, mission],
	);

	return (
		<>
			<SourceReductionFormPage
				canSubmit={canSubmit}
				defaultValues={defaultSourceReductionFormValues(timeZone)}
				header={{
					title: 'Record Source Reduction',
					description: 'Place the point, then record what the crew eliminated, how much, and when.',
					backTo: '/control-operations/source-reduction',
					backLabel: 'Source Reduction',
				}}
				methods={methods}
				initialGeometry={initialGeometry}
				requireLocation={mission.requireLocation}
				onSave={onSave}
				organizationId={organization?.id ?? ''}
				profiles={profiles}
				submitLabel="Record Source Reduction"
				units={units}
			/>
			{mission.dialog}
		</>
	);
}
