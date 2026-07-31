import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	ApplicationRow,
	ControlMethodRow,
	EquipmentRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../sync/reconcile-links';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { saveApplicationBatches, useApplicationBatches } from './-application-batches';
import {
	ApplicationFormPage,
	type ApplicationFormValues,
	type DrawGeometry,
	defaultApplicationFormValues,
	noSelectionValue,
} from './-application-form';

export const Route = createFileRoute('/control-operations/chemical/create')({
	component: CreateApplicationRoute,
});

function CreateApplicationRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.applicationMethods);
	const { rows: insecticides } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: vehicles } = useCollectionRows<VehicleRow>(webCollections.vehicles);
	const { rows: equipment } = useCollectionRows<EquipmentRow>(webCollections.equipment);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// The application's id is minted up front so its crew and batch links can be
	// written the moment it lands — and so the on-demand streams those live on are
	// already warm when the save fires.
	const [applicationId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'application', id: applicationId });
	useApplicationBatches(applicationId);

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: ApplicationFormValues;
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
				throw new Error('Place the application point on the map.');
			}
			if (values.amountApplied === null) {
				throw new Error('Enter the amount applied.');
			}

			// The point is the application's authoritative geometry; the address (if
			// any) is reference only. The server recomputes geom from the location
			// source; this centroid seeds the optimistic row so the map/coordinates
			// show immediately.
			const centroid = ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
			if (centroid === null) {
				throw new Error('Unable to determine the application location.');
			}

			const now = new Date().toISOString();
			const row: ApplicationRow = {
				id: applicationId,
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: centroid.geomType,
				applicationMethodId: nullableSelection(values.applicationMethodId),
				insecticideId: values.insecticideId,
				applicatorProfileId: nullableSelection(values.applicatorProfileId),
				applicationDate: values.applicationDate,
				addressId: values.addressId,
				vehicleId: nullableSelection(values.vehicleId),
				equipmentId: nullableSelection(values.equipmentId),
				amountApplied: values.amountApplied,
				applicationUnitId: values.applicationUnitId,
				habitatId: values.habitatId,
				collectionId: null,
				inspectionId: null,
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

			const transaction = webCollections.applications.insert(row, { metadata: { locationSource } });
			await settleWrite(transaction);
			// Crew and batches are separate rows that reference the application, so
			// they can only be written once it exists.
			await attachLinksBestEffort(async () => {
				await Promise.all([
					saveAdditionalPersonnel({
						target: { type: 'application', id: row.id },
						organizationId: organization.id,
						actorProfileId,
						existing: [],
						profileIds: values.additionalPersonnelIds,
					}),
					saveApplicationBatches({
						applicationId: row.id,
						organizationId: organization.id,
						actorProfileId,
						existing: [],
						insecticideBatchIds: values.insecticideBatchIds,
					}),
				]);
			});
			await navigate({ to: '/control-operations/chemical/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, applicationId, navigate],
	);

	return (
		<ApplicationFormPage
			applicationMethods={methods}
			canSubmit={canSubmit}
			defaultValues={defaultApplicationFormValues()}
			equipment={equipment}
			header={{
				title: 'Record Application',
				description:
					'Place the treated point, pick the product and amount, and note who applied it.',
				backTo: '/control-operations/chemical',
				backLabel: 'Applications',
			}}
			insecticides={insecticides}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record Application"
			units={units}
			vehicles={vehicles}
		/>
	);
}

function nullableSelection(value: string): string | null {
	return value === noSelectionValue || value === '' ? null : value;
}
