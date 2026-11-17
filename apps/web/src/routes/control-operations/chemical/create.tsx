import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	type DrawGeometry,
	TreatmentFormPage,
} from '../../../components/control-operations/chemical/treatment-form';
import {
	defaultTreatmentFormValues,
	type TreatmentFormValues,
	treatmentSaveInput,
} from '../../../components/control-operations/chemical/treatment-form-values';
import type { TreatmentRecipe } from '../../../components/control-operations/chemical/treatment-line-values';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useRecordExtras } from '../../../hooks/forms/use-record-extras';
import { canAttributeWrite, newRecordId } from '../../../hooks/mutations/shared';
import { useTreatmentMutations } from '../../../hooks/mutations/use-treatment-mutations';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { useCatalogRoster } from '../../../hooks/queries/use-catalog-roster';
import { useFormulationComponentRoster } from '../../../hooks/queries/use-formulation-component-roster';
import { useFormulationRoster } from '../../../hooks/queries/use-formulation-roster';
import { useInsecticideRoster } from '../../../hooks/queries/use-insecticide-roster';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useMissionStopExecution } from '../../../hooks/use-mission-stop-execution';
import { useOrganizationClock } from '../../../hooks/use-organization-clock';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { recordNoun } from '../../../lib/record-nouns';
import { habitatSeedSearchSchema, seededValues } from '../../../lib/record-seed-search';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/control-operations/chemical/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...missionStopSearchSchema.parse(search),
		...habitatSeedSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/control-operations/chemical/create')) {
			throw redirect({ replace: true, to: '/control-operations/chemical' });
		}
	},
	component: CreateTreatmentRoute,
});

function CreateTreatmentRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	// Recorded off a mission stop: the server links the Treatment to the stop and
	// completes it in the same transaction, once per Treatment.
	const mission = useMissionStopExecution(search);
	const navigate = useNavigate();
	const clock = useOrganizationClock();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useCatalogRoster(catalogs.applicationMethods);
	const insecticides = useInsecticideRoster();
	const formulations = useFormulationRoster();
	const formulationComponents = useFormulationComponentRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();
	const vehicles = useCatalogRoster(catalogs.vehicles);
	const equipment = useCatalogRoster(catalogs.equipment);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = canAttributeWrite({ organization, actorProfileId });

	// Minted up front so the crew rows and the note can name it the moment it lands.
	const [treatmentId] = useState(newRecordId);
	const recordExtras = useRecordExtras();
	const { record } = useTreatmentMutations();

	// A confirmed acknowledgement re-runs the whole save, which is safe because
	// the Treatment and every line are one command: either all of it landed or
	// none of it did.
	const onSave = async (input: {
		readonly values: TreatmentFormValues;
		readonly recipe: TreatmentRecipe;
		readonly geometry: DrawGeometry | null;
		readonly geometryChanged: boolean;
	}) =>
		mission.run(async (acknowledgements) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			// The geometry is the Treatment's own location; the address (if any) is
			// reference only. On a mission stop the form opens on the stop's
			// geometry, and an untouched one is left for the server to copy.
			const location = mission.resolveLocation(input.geometry, {
				missing: 'Place the treatment on the map.',
				unresolvable: 'Unable to determine the treatment location.',
			});
			const { values, mix, lines } = treatmentSaveInput(input.values, input.recipe);

			// Off a stop this is `missionDispatch.recordTreatmentForMissionItem`; the
			// hook reads the stop id rather than making this form say so.
			await record({
				treatmentId,
				values,
				mix,
				lines,
				location: {
					lat: location.lat,
					lng: location.lng,
					geomType: location.geomType,
					locationSource: location.locationSource,
				},
				missionItemId: mission.missionItemId,
				acknowledgements,
			});

			// Crew rows and the note name the Treatment, so they follow it.
			await recordExtras.attach({
				target: { type: 'treatment', id: treatmentId },
				profileIds: input.values.additionalPersonnelIds,
				commentText: input.values.comment,
			});

			await mission.navigateAfterSave(async () => {
				await navigate({ to: '/control-operations/chemical/$id', params: { id: treatmentId } });
			});
		});

	return (
		<>
			<TreatmentFormPage
				applicationMethods={methods}
				canSubmit={canSubmit}
				mode="create"
				defaultValues={{
					...defaultTreatmentFormValues(clock.zone),
					...seededValues({ habitatId: search.habitatId }),
				}}
				equipment={equipment}
				formulationComponents={formulationComponents}
				formulations={formulations}
				header={{
					title: createLabel('treatment'),
					backTo: '/control-operations/chemical',
					backLabel: recordNoun('treatment').titleMany,
				}}
				insecticides={insecticides}
				initialGeometry={initialGeometry}
				missionStop={mission.missionStop}
				onSave={onSave}
				organizationId={organization.id}
				profiles={profiles}
				units={units}
				vehicles={vehicles}
			/>
			{mission.dialog}
		</>
	);
}
