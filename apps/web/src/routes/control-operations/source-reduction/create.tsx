import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useMissionStopExecution } from '../../../components/mission-stop-execution';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useSourceReductionMutations } from '../../../hooks/mutations/use-source-reduction-mutations';
import { useSourceReductionMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { isWriteBlocked } from '../../../lib/write-access';
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
	const methods = useSourceReductionMethodRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the action lands
	// — and so their on-demand stream is already warm when the save fires.
	const [sourceReductionId] = useState(newRecordId);
	useAdditionalPersonnel({ type: 'sourceReduction', id: sourceReductionId });
	const { record } = useSourceReductionMutations();

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

				// Off a stop this is `missionDispatch.recordSourceReductionForMissionItem`
				// and links the stop; on its own it is
				// `controlOperations.recordSourceReduction`. The hook reads the stop id
				// rather than making this form say which command it meant.
				await record({
					sourceReductionId,
					values: {
						methodId: values.sourceReductionMethodId,
						technicianProfileId:
							values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
						actionDate: values.sourceReductionDate,
						addressId: values.addressId,
						habitatId: values.habitatId,
						sourcesEliminated: values.sourcesEliminatedAmount,
						unitId: values.sourcesEliminatedUnitId,
						metadata: values.metadata,
					},
					location: {
						lat: location.lat,
						lng: location.lng,
						geomType: location.geomType,
						locationSource: location.locationSource,
					},
					missionItemId: mission.missionItemId,
					acknowledgements,
				});
				// Crew rows reference the action, so they can only be written once it exists.
				await attachLinksBestEffort('the additional personnel', () =>
					saveAdditionalPersonnel({
						target: { type: 'sourceReduction', id: sourceReductionId },
						organizationId: organization.id,
						actorProfileId,
						existing: [],
						profileIds: values.additionalPersonnelIds,
					}),
				);
				await mission.navigateAfterSave(async () => {
					await navigate({
						to: '/control-operations/source-reduction/$id',
						params: { id: sourceReductionId },
					});
				});
			}),
		[organization, actorProfileId, sourceReductionId, navigate, mission, record],
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
