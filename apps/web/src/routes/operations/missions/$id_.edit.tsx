import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
	MISSION_FIELD_PATHS,
	MissionFormPage,
	type MissionPlan,
	missionFormValuesFrom,
	validateMissionPlan,
} from '../../../components/operations/missions/mission-form';
import { EditFormSkeleton, RecordEditFrame } from '../../../components/record';
import { useMissionMutations } from '../../../hooks/mutations/use-mission-mutations';
import { type MissionRecord, useMission } from '../../../hooks/queries/use-mission';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { recordNoun } from '../../../lib/record-nouns';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/operations/missions/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/operations/missions/$id/edit')) {
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
	const { mission, isReady, isError } = useMission(id);

	return (
		<RecordEditFrame
			recordType="mission"
			reading={{ isError, isReady, record: mission }}
			skeleton={<EditFormSkeleton frame="pane" rows={['h-24', ['h-9', 'h-9'], 'h-24']} />}
		>
			{(record) => <EditMissionForm mission={record} />}
		</RecordEditFrame>
	);
}

function EditMissionForm({ mission }: { readonly mission: MissionRecord }) {
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const missionWrites = useMissionMutations();

	const onSave = async (plan: MissionPlan) => {
		// The mission as it stands goes with the plan: which of the five update
		// commands this save means is decided by what actually moved, and naming
		// one the change set has nothing for is refused by the domain.
		await missionWrites.updateDetails(
			mission.id,
			{
				controlType: plan.controlType,
				scheduledStartAt: plan.startAt as Date,
				scheduledEndAt: plan.endAt,
				missionName: plan.missionName,
				plannedMethodId: plan.plannedMethodId,
				assignedToProfileId: plan.assignedToProfileId,
				rainDate: plan.rainDate,
				notificationTypeId: plan.notificationTypeId,
			},
			mission,
		);
		await navigate({ to: '/operations/missions/$id', params: { id: mission.id } });
	};

	return (
		<MissionFormPage
			canSubmit={missionWrites.canWrite}
			defaultValues={missionFormValuesFrom(mission, timeZone)}
			errorTitle="Unable to Save Mission"
			fieldPaths={MISSION_FIELD_PATHS}
			header={{
				title: `Edit ${recordNoun('mission').title}`,
				backTo: '/operations/missions/$id',
				backParams: { id: mission.id },
				backLabel: 'Back to mission',
			}}
			onSave={onSave}
			validate={validateMissionPlan}
		/>
	);
}
