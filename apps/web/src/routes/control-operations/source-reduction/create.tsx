import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	defaultSourceReductionFormValues,
	SourceReductionFormPage,
	type SourceReductionSaveInput,
	sourceReductionFieldsFrom,
} from '../../../components/control-operations/source-reduction/source-reduction-form';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useRecordExtras } from '../../../hooks/forms/use-record-extras';
import { canAttributeWrite, newRecordId } from '../../../hooks/mutations/shared';
import { useSourceReductionMutations } from '../../../hooks/mutations/use-source-reduction-mutations';
import { useAdditionalPersonnel } from '../../../hooks/queries/use-additional-personnel';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useSourceReductionMethodRoster } from '../../../hooks/queries/use-source-reduction-method-roster';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useMissionStopExecution } from '../../../hooks/use-mission-stop-execution';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { recordNoun } from '../../../lib/record-nouns';
import { habitatSeedSearchSchema, seededValues } from '../../../lib/record-seed-search';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/control-operations/source-reduction/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...missionStopSearchSchema.parse(search),
		...habitatSeedSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/control-operations/source-reduction/create')) {
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
	const canSubmit = canAttributeWrite({ organization, actorProfileId });

	// Minted up front so the crew rows can be written the moment the action lands
	// — and so their on-demand stream is already warm when the save fires.
	const [sourceReductionId] = useState(newRecordId);
	useAdditionalPersonnel({ type: 'sourceReduction', id: sourceReductionId });
	const recordExtras = useRecordExtras();
	const { record } = useSourceReductionMutations();

	const onSave = async (input: SourceReductionSaveInput) =>
		mission.run(async (acknowledgements) => {
			const { values, geometry } = input;
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			if (values.sourcesEliminatedAmount === null) {
				throw new Error('Enter how many sources were eliminated.');
			}

			// The point is the action's authoritative geometry; the address and habitat
			// (if any) are reference only. On a mission stop the form opens on the
			// stop's geometry, and an untouched one is left for the server to copy.
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
				values: sourceReductionFieldsFrom(values),
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
			await recordExtras.attach({
				target: { type: 'sourceReduction', id: sourceReductionId },
				profileIds: values.additionalPersonnelIds,
				commentText: values.comment,
			});
			await mission.navigateAfterSave(async () => {
				await navigate({
					to: '/control-operations/source-reduction/$id',
					params: { id: sourceReductionId },
				});
			});
		});

	return (
		<>
			<SourceReductionFormPage
				canSubmit={canSubmit}
				defaultValues={{
					...defaultSourceReductionFormValues(timeZone),
					...seededValues({ habitatId: search.habitatId }),
				}}
				header={{
					title: createLabel('sourceReduction'),
					description: 'Place the point, then record what the crew eliminated, how much, and when.',
					backTo: '/control-operations/source-reduction',
					backLabel: recordNoun('sourceReduction').titleMany,
				}}
				methods={methods}
				mode="create"
				initialGeometry={initialGeometry}
				missionStop={mission.missionStop}
				onSave={onSave}
				organizationId={organization.id}
				profiles={profiles}
				units={units}
			/>
			{mission.dialog}
		</>
	);
}
