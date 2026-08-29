import { calculateFormulationComponentAmounts } from '@simmer-mosquito/domain';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useMissionStopExecution } from '../../../components/mission-stop-execution';
import { useRecordExtras } from '../../../forms/record-extras';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useApplicationMutations } from '../../../hooks/mutations/use-application-mutations';
import { useAdditionalPersonnel } from '../../../hooks/queries/use-additional-personnel';
import { useApplicationBatches } from '../../../hooks/queries/use-application-batches';
import { useApplicationMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import type {
	FormulationComponentListing,
	FormulationListing,
} from '../../../hooks/queries/use-chemical-rosters';
import {
	useEquipmentRoster,
	useFormulationComponentRoster,
	useFormulationRoster,
	useInsecticideRoster,
	useVehicleRoster,
} from '../../../hooks/queries/use-chemical-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	ApplicationFormPage,
	type ApplicationFormValues,
	type DrawGeometry,
	defaultApplicationFormValues,
	noSelectionValue,
} from './-application-form';

export const Route = createFileRoute('/control-operations/chemical/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...missionStopSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/control-operations/chemical' });
		}
	},
	component: CreateApplicationRoute,
});

function CreateApplicationRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	// Recorded off a mission stop: the server links the action to the stop and
	// completes it in the same transaction.
	const mission = useMissionStopExecution(search);
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useApplicationMethodRoster();
	const insecticides = useInsecticideRoster();
	const formulations = useFormulationRoster();
	const formulationComponents = useFormulationComponentRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();
	const vehicles = useVehicleRoster();
	const equipment = useEquipmentRoster();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// The first application's id is minted up front so its crew rows can be written
	// the moment it lands — and so the on-demand streams those live on are already
	// warm when the save fires. A formulation mints the rest at save.
	const [applicationId] = useState(newRecordId);
	useAdditionalPersonnel({ type: 'application', id: applicationId });
	const recordExtras = useRecordExtras();
	// The batches ride in the create's own command now, so nothing here needs this
	// list. It stays mounted for the stream: a write cannot wait for its own txid on
	// a collection nobody is subscribed to.
	useApplicationBatches(applicationId);
	const { record } = useApplicationMutations();

	// A confirmed acknowledgement re-runs the whole save. Safe because the loop
	// below only lets a refusal escape while nothing has been written yet: once a
	// mix has landed part way, the failure is reported as a count instead.
	const onSave = useCallback(
		async (input: {
			readonly values: ApplicationFormValues;
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
				if (values.amountApplied === null) {
					throw new Error('Enter the amount applied.');
				}

				// The point is the application's authoritative geometry; the address (if
				// any) is reference only. Off a mission stop it is required; on one it is
				// an override the crew may not have drawn, and the server falls back to
				// the stop's own ground.
				const location = mission.resolveLocation(geometry, {
					missing: 'Place the application point on the map.',
					unresolvable: 'Unable to determine the application location.',
				});

				// A formulation is a calculator: it becomes one ordinary application per
				// component product, each holding its own share of the total. Nothing
				// records that they came from a mix.
				const products =
					values.productMode === 'formulation'
						? formulationProducts(values, formulations, formulationComponents, applicationId)
						: [
								{
									id: applicationId,
									insecticideId: values.insecticideId,
									amountApplied: values.amountApplied,
									applicationUnitId: values.applicationUnitId,
									insecticideBatchIds: values.insecticideBatchIds,
								},
							];

				// Written one at a time so a failure part way through a mix can say how
				// much of it landed — those rows are real applications the user now owns.
				// Each product is its own command, so they cannot share one transaction:
				// a single rollback would take back rows the server had already committed.
				const saved: ApplicationProduct[] = [];
				for (const product of products) {
					try {
						// The batches go with it, in the same command and the same Postgres
						// transaction — an application and the lots it drew from either both
						// land or neither does. Off a stop this is
						// `missionDispatch.recordChemicalApplicationForMissionItem`; the hook
						// reads the stop id rather than making this form say so.
						await record({
							applicationId: product.id,
							values: {
								insecticideId: product.insecticideId,
								amountApplied: product.amountApplied,
								unitId: product.applicationUnitId,
								actionDate: values.applicationDate,
								methodId: nullableSelection(values.applicationMethodId),
								applicatorProfileId: nullableSelection(values.applicatorProfileId),
								vehicleId: nullableSelection(values.vehicleId),
								equipmentId: nullableSelection(values.equipmentId),
								addressId: values.addressId,
								habitatId: values.habitatId,
								metadata: values.metadata,
							},
							location: {
								lat: location.lat,
								lng: location.lng,
								geomType: location.geomType,
								locationSource: location.locationSource,
							},
							insecticideBatchIds: product.insecticideBatchIds,
							missionItemId: mission.missionItemId,
							acknowledgements,
						});
					} catch (error) {
						if (saved.length === 0) {
							throw error;
						}
						throw new Error(
							`Recorded ${saved.length} of ${products.length} applications before failing: ${
								error instanceof Error ? error.message : 'Unknown error.'
							}`,
						);
					}
					saved.push(product);
				}

				// Crew rows and the note reference the application, so they can only be
				// written once it exists. The batches used to be here too, and are not any
				// more. A formulation splits into one application per component, so both
				// go on each of them rather than on whichever one happens to be first.
				await Promise.all(
					saved.map((product) =>
						recordExtras.attach({
							target: { type: 'application', id: product.id },
							profileIds: values.additionalPersonnelIds,
							commentText: values.comment,
						}),
					),
				);

				const first = saved[0];
				if (saved.length > 1 || first === undefined) {
					toast.success(`Recorded ${saved.length} applications.`);
					await navigate({ to: '/control-operations/chemical' });
					return;
				}
				await mission.navigateAfterSave(async () => {
					await navigate({ to: '/control-operations/chemical/$id', params: { id: first.id } });
				});
			}),
		[
			mission,
			organization,
			actorProfileId,
			applicationId,
			formulations,
			formulationComponents,
			navigate,
			record,
			recordExtras,
		],
	);

	return (
		<>
			<ApplicationFormPage
				applicationMethods={methods}
				canSubmit={canSubmit}
				mode="create"
				defaultValues={defaultApplicationFormValues(timeZone)}
				equipment={equipment}
				formulationComponents={formulationComponents}
				formulations={formulations}
				header={{
					title: 'Record Application',
					description:
						'Place the treated point, pick the product and amount, and note who applied it.',
					backTo: '/control-operations/chemical',
					backLabel: 'Applications',
				}}
				insecticides={insecticides}
				initialGeometry={initialGeometry}
				requireLocation={mission.requireLocation}
				onSave={onSave}
				organizationId={organization?.id ?? ''}
				profiles={profiles}
				submitLabel="Record Application"
				units={units}
				vehicles={vehicles}
			/>
			{mission.dialog}
		</>
	);
}

interface ApplicationProduct {
	readonly id: string;
	readonly insecticideId: string;
	readonly amountApplied: number;
	/** The product's own unit — a mix measured in gallons can yield pounds. */
	readonly applicationUnitId: string;
	readonly insecticideBatchIds: readonly string[];
}

/**
 * Split a mix into the applications it becomes — the domain's own component
 * split, so the rows written match the breakdown the form previewed.
 *
 * The first application reuses the id minted when the page opened; the rest are
 * minted here, since how many there are is not known until a mix is chosen.
 */
function formulationProducts(
	values: ApplicationFormValues,
	formulations: readonly FormulationListing[],
	formulationComponents: readonly FormulationComponentListing[],
	firstApplicationId: string,
): readonly ApplicationProduct[] {
	const formulation = formulations.find((row) => row.id === values.formulationId);
	if (formulation === undefined) {
		throw new Error('That formulation is no longer available.');
	}
	const components = formulationComponents.filter(
		(component) => component.formulationId === formulation.id,
	);
	if (components.length === 0) {
		throw new Error(`${formulation.formulationName} has no products in it.`);
	}

	const amounts = calculateFormulationComponentAmounts({
		totalAmount: values.amountApplied ?? 0,
		batchSize: formulation.batchSize,
		components: components.map((component) => ({
			insecticideId: component.insecticideId,
			amount: component.amount,
			unitId: component.unitId,
		})),
	});

	return amounts.map((amount, index) => ({
		id: index === 0 ? firstApplicationId : newRecordId(),
		insecticideId: amount.insecticideId,
		amountApplied: amount.amount,
		applicationUnitId: amount.unitId,
		insecticideBatchIds: values.componentBatchIds[amount.insecticideId] ?? [],
	}));
}

function nullableSelection(value: string): string | null {
	return value === noSelectionValue || value === '' ? null : value;
}
