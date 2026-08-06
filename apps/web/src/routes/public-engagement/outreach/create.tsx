import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { ControlMethodRow, OutreachActionRow, ProfileRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
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
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/public-engagement/outreach' });
		}
	},
	component: CreateOutreachActionRoute,
});

function CreateOutreachActionRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.outreachMethods);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the action lands
	// — and so their on-demand stream is already warm when the save fires.
	const [outreachActionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'outreachAction', id: outreachActionId });

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: OutreachFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			if (geometry === null) {
				throw new Error('Place the outreach location on the map.');
			}
			if (values.reach === null) {
				throw new Error('Enter how many people were reached.');
			}

			// The geometry is the action's authoritative location; the address (if any)
			// is reference only. The server recomputes geom from the location source;
			// this centroid seeds the optimistic row so the map shows it immediately.
			const centroid = ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
			if (centroid === null) {
				throw new Error('Unable to determine the outreach location.');
			}

			const now = new Date().toISOString();
			const reachDescription = values.reachDescription.trim();
			const row: OutreachActionRow = {
				id: outreachActionId,
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: centroid.geomType,
				outreachMethodId: values.outreachMethodId,
				technicianProfileId:
					values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
				outreachDate: values.outreachDate,
				addressId: values.addressId,
				inspectionId: null,
				reach: values.reach,
				reachDescription: reachDescription === '' ? null : reachDescription,
				requestedControlActionId: null,
				missionItemId: null,
				metadata: values.metadata,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};

			const locationSource = {
				kind: 'geometry',
				geometry: geometry as unknown as GeoJsonGeometry,
			} as const;

			const transaction = webCollections.outreachActions.insert(row, {
				metadata: { locationSource },
			});
			await settleWrite(transaction);
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
			await navigate({ to: '/public-engagement/outreach/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, outreachActionId, navigate],
	);

	return (
		<OutreachFormPage
			canSubmit={canSubmit}
			defaultValues={defaultOutreachFormValues()}
			header={{
				title: 'Record outreach',
				description:
					'Place where the outreach happened, then record the method, how many were reached, and the date.',
				backTo: '/public-engagement/outreach',
				backLabel: 'Outreach',
			}}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			outreachMethods={methods}
			profiles={profiles}
			submitLabel="Record outreach"
		/>
	);
}
