import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	BiocontrolActionRow,
	ControlMethodRow,
	ProfileRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import {
	BiocontrolFormPage,
	type BiocontrolFormValues,
	type DrawGeometry,
	defaultBiocontrolFormValues,
	noTechnicianValue,
} from './-biocontrol-form';

export const Route = createFileRoute('/control-operations/biocontrol/create')({
	component: CreateBiocontrolActionRoute,
});

function CreateBiocontrolActionRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.biocontrolMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the release lands
	// — and so their on-demand stream is already warm when the save fires.
	const [biocontrolActionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'biocontrolAction', id: biocontrolActionId });

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: BiocontrolFormValues;
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
				throw new Error('Place the release point on the map.');
			}
			if (values.amountReleased === null) {
				throw new Error('Enter how much was released.');
			}

			// The point is the action's authoritative geometry; the address (if any) is
			// reference only. The server recomputes geom from the location source; this
			// centroid seeds the optimistic row so the map/coordinates show immediately.
			const centroid = ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
			if (centroid === null) {
				throw new Error('Unable to determine the release location.');
			}

			const now = new Date().toISOString();
			const row: BiocontrolActionRow = {
				id: biocontrolActionId,
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: centroid.geomType,
				biocontrolMethodId: values.biocontrolMethodId,
				technicianProfileId:
					values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
				biocontrolDate: values.biocontrolDate,
				addressId: values.addressId,
				habitatId: values.habitatId,
				inspectionId: null,
				amountReleased: values.amountReleased,
				releaseUnitId: values.releaseUnitId,
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

			const transaction = webCollections.biocontrolActions.insert(row, {
				metadata: { locationSource },
			});
			await settleWrite(transaction);
			// Crew rows reference the release, so they can only be written once it exists.
			await attachLinksBestEffort('the additional personnel', () =>
				saveAdditionalPersonnel({
					target: { type: 'biocontrolAction', id: row.id },
					organizationId: organization.id,
					actorProfileId,
					existing: [],
					profileIds: values.additionalPersonnelIds,
				}),
			);
			await navigate({ to: '/control-operations/biocontrol/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, biocontrolActionId, navigate],
	);

	return (
		<BiocontrolFormPage
			biocontrolMethods={methods}
			canSubmit={canSubmit}
			defaultValues={defaultBiocontrolFormValues()}
			header={{
				title: 'Record biocontrol',
				description:
					'Place the release point, then record the method, amount, and date of the release.',
				backTo: '/control-operations/biocontrol',
				backLabel: 'Biocontrol',
			}}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record biocontrol"
			units={units}
		/>
	);
}
