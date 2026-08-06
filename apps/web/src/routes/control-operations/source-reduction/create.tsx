import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	ControlMethodRow,
	ProfileRow,
	SourceReductionRow,
	UnitRow,
} from '@simmer-mosquito/sync';
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
	defaultSourceReductionFormValues,
	noTechnicianValue,
	SourceReductionFormPage,
	type SourceReductionSaveInput,
} from './-source-reduction-form';

export const Route = createFileRoute('/control-operations/source-reduction/create')({
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/control-operations/source-reduction' });
		}
	},
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

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// Minted up front so the crew rows can be written the moment the action lands
	// — and so their on-demand stream is already warm when the save fires.
	const [sourceReductionId] = useState(() => crypto.randomUUID());
	useAdditionalPersonnel({ type: 'sourceReduction', id: sourceReductionId });

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
				id: sourceReductionId,
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

			const transaction = webCollections.sourceReductions.insert(row, {
				metadata: { locationSource },
			});
			await settleWrite(transaction);
			// Crew rows reference the action, so they can only be written once it exists.
			await attachLinksBestEffort('the additional personnel', () =>
				saveAdditionalPersonnel({
					target: { type: 'sourceReduction', id: row.id },
					organizationId: organization.id,
					actorProfileId,
					existing: [],
					profileIds: values.additionalPersonnelIds,
				}),
			);
			await navigate({ to: '/control-operations/source-reduction/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, sourceReductionId, navigate],
	);

	return (
		<SourceReductionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultSourceReductionFormValues()}
			header={{
				title: 'Record Source Reduction',
				description: 'Place the point, then record what the crew eliminated, how much, and when.',
				backTo: '/control-operations/source-reduction',
				backLabel: 'Source Reduction',
			}}
			methods={methods}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record Source Reduction"
			units={units}
		/>
	);
}
