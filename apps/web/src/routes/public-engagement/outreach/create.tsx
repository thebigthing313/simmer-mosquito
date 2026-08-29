import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useMissionStopExecution } from '../../../components/mission-stop-execution';
import { attachFirstComment } from '../../../forms/first-comment';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useCommentMutations } from '../../../hooks/mutations/use-comment-mutations';
import { useOutreachActionMutations } from '../../../hooks/mutations/use-outreach-action-mutations';
import { useAdditionalPersonnel } from '../../../hooks/queries/use-additional-personnel';
import { useOutreachMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	type DrawGeometry,
	defaultOutreachFormValues,
	noTechnicianValue,
	OutreachFormPage,
	type OutreachFormValues,
} from './-outreach-form';

export const Route = createFileRoute('/public-engagement/outreach/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...missionStopSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/public-engagement/outreach' });
		}
	},
	component: CreateOutreachActionRoute,
});

function CreateOutreachActionRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	// Recorded off a mission stop: the server links the action to the stop and
	// completes it in the same transaction.
	const mission = useMissionStopExecution(search);
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useOutreachMethodRoster();
	const profiles = useProfileRoster();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the action lands
	// — and so their on-demand stream is already warm when the save fires.
	const [outreachActionId] = useState(newRecordId);
	useAdditionalPersonnel({ type: 'outreachAction', id: outreachActionId });
	const { setPersonnel } = useAdditionalPersonnelMutations();
	const { add: addComment } = useCommentMutations();
	const { record } = useOutreachActionMutations();

	const onSave = useCallback(
		async (input: {
			readonly values: OutreachFormValues;
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
				if (values.reach === null) {
					throw new Error('Enter how many people were reached.');
				}

				// The geometry is the action's authoritative location; the address (if any)
				// is reference only. Off a mission stop it is required; on one it is an
				// override the crew may not have drawn, and the server falls back to the
				// stop's own ground.
				const location = mission.resolveLocation(geometry, {
					missing: 'Place the outreach location on the map.',
					unresolvable: 'Unable to determine the outreach location.',
				});

				const trimmedDescription = values.reachDescription.trim();

				// Off a stop this is `missionDispatch.recordOutreachActionForMissionItem`
				// and links the stop; on its own it is
				// `controlOperations.recordOutreachAction`. The hook reads the stop id
				// rather than making this form say which command it meant.
				await record({
					outreachActionId,
					values: {
						methodId: values.outreachMethodId,
						technicianProfileId:
							values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
						actionDate: values.outreachDate,
						addressId: values.addressId,
						reach: values.reach,
						reachDescription: trimmedDescription === '' ? null : trimmedDescription,
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
					setPersonnel({
						target: { type: 'outreachAction', id: outreachActionId },
						existing: [],
						profileIds: values.additionalPersonnelIds,
					}),
				);
				await attachFirstComment(
					addComment,
					{ type: 'outreachAction', id: outreachActionId },
					values.comment,
				);
				await mission.navigateAfterSave(async () => {
					await navigate({
						to: '/public-engagement/outreach/$id',
						params: { id: outreachActionId },
					});
				});
			}),
		[
			organization,
			actorProfileId,
			outreachActionId,
			navigate,
			mission,
			record,
			setPersonnel,
			addComment,
		],
	);

	return (
		<>
			<OutreachFormPage
				canSubmit={canSubmit}
				mode="create"
				defaultValues={defaultOutreachFormValues(timeZone)}
				header={{
					title: 'Record Outreach',
					description:
						'Place where the outreach happened, then record the method, how many were reached, and the date.',
					backTo: '/public-engagement/outreach',
					backLabel: 'Outreach',
				}}
				initialGeometry={initialGeometry}
				requireLocation={mission.requireLocation}
				onSave={onSave}
				organizationId={organization?.id ?? ''}
				outreachMethods={methods}
				profiles={profiles}
				submitLabel="Record Outreach"
			/>
			{mission.dialog}
		</>
	);
}
