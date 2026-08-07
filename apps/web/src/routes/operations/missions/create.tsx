import { createMissionCommand } from '@simmer-mosquito/domain';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowRole } from '../../../lib/write-access';
import { createMission, useMission } from '../-operations-data';
import {
	defaultMissionFormValues,
	MISSION_FIELD_PATHS,
	MissionFormPage,
	type MissionPlan,
} from './-mission-form';

export const Route = createFileRoute('/operations/missions/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/operations/missions' });
		}
	},
	component: CreateMissionRoute,
});

function CreateMissionRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	// Minted up front so the on-demand stream is warm when the save fires — a
	// write to a cold collection waits out its txid confirmation, which reads as a
	// frozen save.
	const [missionId] = useState(() => crypto.randomUUID());
	useMission(missionId);

	const organizationId = organization?.id ?? null;

	const onSave = useCallback(
		async (plan: MissionPlan) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your organization and profile are still loading.');
			}
			await createMission({
				missionId,
				organizationId,
				actorProfileId,
				controlType: plan.controlType,
				scheduledStartAt: (plan.startAt as Date).toISOString(),
				scheduledEndAt: plan.endAt?.toISOString() ?? null,
				missionName: plan.missionName,
				plannedMethodId: plan.plannedMethodId,
				assignedToProfileId: plan.assignedToProfileId,
				rainDate: plan.rainDate,
				notificationTypeId: plan.notificationTypeId,
			});
			await navigate({ to: '/operations/missions' });
		},
		[organizationId, actorProfileId, missionId, navigate],
	);

	return (
		<MissionFormPage
			canSubmit={organizationId !== null && actorProfileId !== null}
			defaultValues={useMemo(() => defaultMissionFormValues(), [])}
			errorTitle="Unable to Create Mission"
			fieldPaths={MISSION_FIELD_PATHS}
			header={{
				title: 'New Mission',
				description:
					'Schedule the work and say what kind. Stops are added to the mission afterwards.',
				backTo: '/operations/missions',
				backLabel: 'Missions',
			}}
			onSave={onSave}
			submitLabel="Create Mission"
			validate={(plan) =>
				createMissionCommand({
					...FORM_VALIDATION_CONTEXT,
					missionId: FORM_VALIDATION_CONTEXT.organizationId,
					controlType: plan.controlType,
					// The builder reports a missing start itself; handing it the null keeps
					// that one message rather than adding a second, earlier one here.
					scheduledStartAt: plan.startAt as Date,
					scheduledEndAt: plan.endAt,
					rainDate: plan.rainDate,
					missionName: plan.missionName,
					plannedMethodId: plan.plannedMethodId,
					assignedToProfileId: plan.assignedToProfileId,
					notificationTypeId: plan.notificationTypeId,
				})
			}
		/>
	);
}
