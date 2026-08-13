import { createMissionCommand } from '@simmer-mosquito/domain';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { RecordUnavailable } from '../../../components/record';
import { FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { isBelowRole } from '../../../lib/write-access';
import { type MissionView, updateMission, useMission } from '../-operations-data';
import {
	MISSION_FIELD_PATHS,
	MissionFormPage,
	type MissionPlan,
	missionFormValuesFrom,
} from './-mission-form';

export const Route = createFileRoute('/operations/missions/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/operations/missions/$id',
			});
		}
	},
	component: EditMissionRoute,
});

function EditMissionRoute() {
	const { id } = Route.useParams();
	const { mission, isReady } = useMission(id);

	if (mission === null) {
		return isReady ? (
			<RecordUnavailable layout="centered" noun="mission" reason="not-found" />
		) : (
			<EditFormSkeleton />
		);
	}
	return <EditMissionForm mission={mission} />;
}

function EditMissionForm({ mission }: { readonly mission: MissionView }) {
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const auth = useAuthSnapshot();
	const actorProfileId = auth?.authenticated === true ? auth.localIdentity.profileId : null;

	const onSave = useCallback(
		async (plan: MissionPlan) => {
			await updateMission({
				missionId: mission.id,
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
			await navigate({ to: '/operations/missions/$id', params: { id: mission.id } });
		},
		[mission.id, actorProfileId, navigate],
	);

	// The five update builders the server runs each validate a slice of these same
	// fields; `createMissionCommand` covers all of them in one pass, which is what
	// a form needs — it validates the whole thing at once rather than whichever
	// slice happens to have changed. The server still runs the real builders.
	const validate = useCallback(
		(plan: MissionPlan) =>
			createMissionCommand({
				...FORM_VALIDATION_CONTEXT,
				missionId: FORM_VALIDATION_CONTEXT.organizationId,
				controlType: plan.controlType,
				scheduledStartAt: plan.startAt as Date,
				scheduledEndAt: plan.endAt,
				rainDate: plan.rainDate,
				missionName: plan.missionName,
				plannedMethodId: plan.plannedMethodId,
				assignedToProfileId: plan.assignedToProfileId,
				notificationTypeId: plan.notificationTypeId,
			}),
		[],
	);

	return (
		<MissionFormPage
			canSubmit={actorProfileId !== null}
			defaultValues={useMemo(() => missionFormValuesFrom(mission, timeZone), [mission, timeZone])}
			errorTitle="Unable to Save Mission"
			fieldPaths={MISSION_FIELD_PATHS}
			header={{
				title: 'Edit Mission',
				description: 'Change what the mission is for, when it runs, or who is on it.',
				backTo: '/operations/missions/$id',
				backParams: { id: mission.id },
				backLabel: 'Back to mission',
			}}
			onSave={onSave}
			submitLabel="Save Changes"
			validate={validate}
		/>
	);
}

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 content-start gap-5 px-5 py-5">
			<Skeleton className="h-6 w-40" />
			<Skeleton className="h-24 w-full" />
			<div className="grid grid-cols-2 gap-4">
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-full" />
			</div>
			<Skeleton className="h-24 w-full" />
		</div>
	);
}
