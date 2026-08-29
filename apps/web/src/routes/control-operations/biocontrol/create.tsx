import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useMissionStopExecution } from '../../../components/mission-stop-execution';
import { useRecordExtras } from '../../../forms/record-extras';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useBiocontrolActionMutations } from '../../../hooks/mutations/use-biocontrol-action-mutations';
import { useAdditionalPersonnel } from '../../../hooks/queries/use-additional-personnel';
import { useBiocontrolMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	BiocontrolFormPage,
	type BiocontrolFormValues,
	biocontrolFieldsFrom,
	type DrawGeometry,
	defaultBiocontrolFormValues,
} from './-biocontrol-form';

export const Route = createFileRoute('/control-operations/biocontrol/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...missionStopSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/control-operations/biocontrol' });
		}
	},
	component: CreateBiocontrolActionRoute,
});

function CreateBiocontrolActionRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	// Recorded off a mission stop: the server links the action to the stop and
	// completes it in the same transaction.
	const mission = useMissionStopExecution(search);
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useBiocontrolMethodRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the release lands
	// — and so their on-demand stream is already warm when the save fires.
	const [biocontrolActionId] = useState(newRecordId);
	useAdditionalPersonnel({ type: 'biocontrolAction', id: biocontrolActionId });
	const recordExtras = useRecordExtras();
	const { record } = useBiocontrolActionMutations();

	const onSave = useCallback(
		async (input: {
			readonly values: BiocontrolFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) =>
			mission.run(async (acknowledgements) => {
				const { values, geometry } = input;
				if (organization === null) {
					throw new Error('Organization details are still loading.');
				}
				if (actorProfileId === null) {
					throw new Error('Your profile is still loading.');
				}
				if (values.amountReleased === null) {
					throw new Error('Enter how much was released.');
				}

				// The point is the action's authoritative geometry; the address (if any) is
				// reference only. Off a mission stop it is required; on one it is an
				// override the crew may not have drawn, and the server falls back to the
				// stop's own ground.
				const location = mission.resolveLocation(geometry, {
					missing: 'Place the release point on the map.',
					unresolvable: 'Unable to determine the release location.',
				});

				// Off a stop this is `missionDispatch.recordBiocontrolActionForMissionItem`
				// and links the stop; on its own it is
				// `controlOperations.recordBiocontrolAction`. The hook reads the stop id
				// rather than making this form say which command it meant.
				await record({
					biocontrolActionId,
					values: biocontrolFieldsFrom(values),
					location: {
						lat: location.lat,
						lng: location.lng,
						geomType: location.geomType,
						locationSource: location.locationSource,
					},
					missionItemId: mission.missionItemId,
					acknowledgements,
				});
				// Crew rows reference the release, so they can only be written once it exists.
				await recordExtras.attach({
					target: { type: 'biocontrolAction', id: biocontrolActionId },
					profileIds: values.additionalPersonnelIds,
					commentText: values.comment,
				});
				await mission.navigateAfterSave(async () => {
					await navigate({
						to: '/control-operations/biocontrol/$id',
						params: { id: biocontrolActionId },
					});
				});
			}),
		[organization, actorProfileId, biocontrolActionId, navigate, mission, record, recordExtras],
	);

	return (
		<>
			<BiocontrolFormPage
				biocontrolMethods={methods}
				canSubmit={canSubmit}
				defaultValues={defaultBiocontrolFormValues(timeZone)}
				header={{
					title: 'Record Biocontrol',
					description:
						'Place the release point, then record the method, amount, and date of the release.',
					backTo: '/control-operations/biocontrol',
					backLabel: 'Biocontrol',
				}}
				mode="create"
				initialGeometry={initialGeometry}
				requireLocation={mission.requireLocation}
				onSave={onSave}
				organizationId={organization?.id ?? ''}
				profiles={profiles}
				submitLabel="Record Biocontrol"
				units={units}
			/>
			{mission.dialog}
		</>
	);
}
