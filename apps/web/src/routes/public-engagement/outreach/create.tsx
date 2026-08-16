import type { ControlMethodRow, OutreachActionRow } from '@simmer-mosquito/sync';
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
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.outreachMethods);
	const profiles = useProfileRoster();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the action lands
	// — and so their on-demand stream is already warm when the save fires.
	const [outreachActionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'outreachAction', id: outreachActionId });

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

				const now = new Date().toISOString();
				const reachDescription = values.reachDescription.trim();
				const row: OutreachActionRow = {
					id: outreachActionId,
					organizationId: organization.id,
					lat: location.lat,
					lng: location.lng,
					geomType: location.geomType,
					outreachMethodId: values.outreachMethodId,
					technicianProfileId:
						values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
					outreachDate: values.outreachDate,
					addressId: values.addressId,
					inspectionId: null,
					reach: values.reach,
					reachDescription: reachDescription === '' ? null : reachDescription,
					requestedControlActionId: null,
					missionItemId: mission.missionItemId,
					metadata: values.metadata,
					createdByProfileId: actorProfileId,
					updatedByProfileId: actorProfileId,
					createdAt: now,
					updatedAt: now,
				};

				await settleWrite(
					webCollections.outreachActions.insert(row, {
						metadata: { acknowledgements, locationSource: location.locationSource },
					}),
				);
				// Crew rows reference the action, so they can only be written once it exists.
				await attachLinksBestEffort('the additional personnel', () =>
					saveAdditionalPersonnel({
						target: { type: 'outreachAction', id: row.id },
						organizationId: organization.id,
						actorProfileId,
						existing: [],
						profileIds: values.additionalPersonnelIds,
					}),
				);
				await mission.navigateAfterSave(async () => {
					await navigate({ to: '/public-engagement/outreach/$id', params: { id: row.id } });
				});
			}),
		[organization, actorProfileId, outreachActionId, navigate, mission],
	);

	return (
		<>
			<OutreachFormPage
				canSubmit={canSubmit}
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
