import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import { canAttributeWrite, newRecordId } from '../../../hooks/mutations/shared';
import { useMissionMutations } from '../../../hooks/mutations/use-mission-mutations';
import { useMission } from '../../../hooks/queries/use-mission';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { recordNoun } from '../../../lib/record-nouns';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';
import {
	defaultMissionFormValues,
	MISSION_FIELD_PATHS,
	MissionFormPage,
	type MissionPlan,
	validateMissionPlan,
} from './-mission-form';

export const Route = createFileRoute('/operations/missions/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/operations/missions/create')) {
			throw redirect({ replace: true, to: '/operations/missions' });
		}
	},
	component: CreateMissionRoute,
});

function CreateMissionRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	// Minted up front so the on-demand stream is warm when the save fires — a
	// write to a cold collection waits out its txid confirmation, which reads as a
	// frozen save.
	const [missionId] = useState(() => newRecordId());
	useMission(missionId);

	const missionWrites = useMissionMutations();

	const onSave = async (plan: MissionPlan) => {
		if (actorProfileId === null) {
			throw new Error('Your profile is still loading.');
		}
		await missionWrites.create(missionId, {
			controlType: plan.controlType,
			scheduledStartAt: plan.startAt as Date,
			scheduledEndAt: plan.endAt,
			missionName: plan.missionName,
			plannedMethodId: plan.plannedMethodId,
			assignedToProfileId: plan.assignedToProfileId,
			rainDate: plan.rainDate,
			notificationTypeId: plan.notificationTypeId,
		});
		await navigate({ to: '/operations/missions' });
	};

	return (
		<MissionFormPage
			canSubmit={canAttributeWrite({ organization, actorProfileId })}
			defaultValues={defaultMissionFormValues(timeZone)}
			errorTitle="Unable to Create Mission"
			fieldPaths={MISSION_FIELD_PATHS}
			header={{
				title: createLabel('mission'),
				description:
					'Schedule the work and say what kind. Stops are added to the mission afterwards.',
				backTo: '/operations/missions',
				backLabel: recordNoun('mission').titleMany,
			}}
			onSave={onSave}
			validate={validateMissionPlan}
		/>
	);
}
