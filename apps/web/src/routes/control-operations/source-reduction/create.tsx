import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	ControlMethodRow,
	HabitatRow,
	ProfileRow,
	SourceReductionRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import {
	defaultSourceReductionFormValues,
	noTechnicianValue,
	SourceReductionFormPage,
	type SourceReductionSaveInput,
} from './-source-reduction-form';

export const Route = createFileRoute('/control-operations/source-reduction/create')({
	component: CreateSourceReductionRoute,
});

function CreateSourceReductionRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(
		webCollections.sourceReductionMethods,
	);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: habitats } = useCollectionRows<HabitatRow>(webCollections.habitats);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	const onSave = useCallback(
		async ({ values, geometry }: SourceReductionSaveInput) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			if (geometry === null) {
				throw new Error('Place the point where the sources were eliminated.');
			}
			if (values.sourcesEliminatedAmount === null) {
				throw new Error('Enter how many sources were eliminated.');
			}

			// The point is the action's authoritative geometry; the address and habitat
			// (if any) are reference only. The server recomputes geom from the location
			// source; this centroid seeds the optimistic row so the map/coordinates show
			// immediately.
			const centroid = ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
			if (centroid === null) {
				throw new Error('Unable to determine the source reduction location.');
			}

			const now = new Date().toISOString();
			const row: SourceReductionRow = {
				id: crypto.randomUUID(),
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: centroid.geomType,
				sourceReductionMethodId: values.sourceReductionMethodId,
				technicianProfileId:
					values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
				sourceReductionDate: values.sourceReductionDate,
				addressId: values.addressId,
				habitatId: values.habitatId,
				sourcesEliminatedAmount: values.sourcesEliminatedAmount,
				sourcesEliminatedUnitId: values.sourcesEliminatedUnitId,
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

			const transaction = webCollections.sourceReductions.insert(row, {
				metadata: { locationSource },
			});
			await transaction.isPersisted.promise;
			await navigate({ to: '/control-operations/source-reduction/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, navigate],
	);

	return (
		<SourceReductionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultSourceReductionFormValues()}
			habitats={habitats}
			header={{
				title: 'Record source reduction',
				description: 'Place the point, then record what the crew eliminated, how much, and when.',
				backTo: '/control-operations/source-reduction',
				backLabel: 'Source reduction',
			}}
			methods={methods}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record source reduction"
			units={units}
		/>
	);
}
