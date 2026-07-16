import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	ApplicationRow,
	ControlMethodRow,
	EquipmentRow,
	HabitatRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
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
	const { rows: habitats } = useCollectionRows<HabitatRow>(webCollections.habitats);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

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
				id: crypto.randomUUID(),
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
				metadata: null,
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
			await transaction.isPersisted.promise;
			await navigate({ to: '/control-operations/chemical/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, navigate],
	);

	return (
		<ApplicationFormPage
			applicationMethods={methods}
			canSubmit={canSubmit}
			defaultValues={defaultApplicationFormValues()}
			equipment={equipment}
			habitats={habitats}
			header={{
				title: 'Record application',
				description:
					'Place the treated point, pick the product and amount, and note who applied it.',
				backTo: '/control-operations/chemical',
				backLabel: 'Applications',
			}}
			insecticides={insecticides}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record application"
			units={units}
			vehicles={vehicles}
		/>
	);
}

function nullableSelection(value: string): string | null {
	return value === noSelectionValue || value === '' ? null : value;
}
