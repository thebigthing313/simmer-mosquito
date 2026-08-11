import { calculateFormulationComponentAmounts } from '@simmer-mosquito/domain';
import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	ApplicationRow,
	ControlMethodRow,
	EquipmentRow,
	FormulationInsecticideRow,
	FormulationRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { missionStopSearchSchema } from '../../../lib/mission-stop-search';
import { isWriteBlocked } from '../../../lib/write-access';
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
	const missionItemId = search.missionItemId ?? null;
	const missionId = search.missionId ?? null;
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.applicationMethods);
	const { rows: insecticides } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: formulations } = useCollectionRows<FormulationRow>(webCollections.formulations);
	const { rows: formulationComponents } = useCollectionRows<FormulationInsecticideRow>(
		webCollections.formulationInsecticides,
	);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: vehicles } = useCollectionRows<VehicleRow>(webCollections.vehicles);
	const { rows: equipment } = useCollectionRows<EquipmentRow>(webCollections.equipment);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// The first application's id is minted up front so its crew and batch links can
	// be written the moment it lands — and so the on-demand streams those live on
	// are already warm when the save fires. A formulation mints the rest at save.
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

			const now = new Date().toISOString();
			const rows = products.map(
				(product): ApplicationRow => ({
					id: product.id,
					organizationId: organization.id,
					lat: centroid.lat,
					lng: centroid.lng,
					geomType: centroid.geomType,
					applicationMethodId: nullableSelection(values.applicationMethodId),
					insecticideId: product.insecticideId,
					applicatorProfileId: nullableSelection(values.applicatorProfileId),
					applicationDate: values.applicationDate,
					addressId: values.addressId,
					vehicleId: nullableSelection(values.vehicleId),
					equipmentId: nullableSelection(values.equipmentId),
					amountApplied: product.amountApplied,
					applicationUnitId: product.applicationUnitId,
					habitatId: values.habitatId,
					collectionId: null,
					inspectionId: null,
					requestedControlActionId: null,
					missionItemId,
					metadata: values.metadata,
					createdByProfileId: actorProfileId,
					updatedByProfileId: actorProfileId,
					createdAt: now,
					updatedAt: now,
				}),
			);

			const locationSource = {
				kind: 'geometry',
				geometry: geometry as unknown as GeoJsonGeometry,
			} as const;

			// Written one at a time so a failure part way through a mix can say how
			// much of it landed — those rows are real applications the user now owns.
			const saved: ApplicationRow[] = [];
			for (const row of rows) {
				try {
					await settleWrite(
						webCollections.applications.insert(row, { metadata: { locationSource } }),
					);
				} catch (error) {
					if (saved.length === 0) {
						throw error;
					}
					throw new Error(
						`Recorded ${saved.length} of ${rows.length} applications before failing: ${
							error instanceof Error ? error.message : 'Unknown error.'
						}`,
					);
				}
				saved.push(row);
			}

			// Crew and batches are separate rows that reference the application, so
			// they can only be written once it exists. Reported one at a time, so a
			// failure names which of the two did not land.
			await Promise.all(
				saved.flatMap((row, index) => [
					attachLinksBestEffort('the additional personnel', () =>
						saveAdditionalPersonnel({
							target: { type: 'application', id: row.id },
							organizationId: organization.id,
							actorProfileId,
							existing: [],
							profileIds: values.additionalPersonnelIds,
						}),
					),
					attachLinksBestEffort('the batches', () =>
						saveApplicationBatches({
							applicationId: row.id,
							organizationId: organization.id,
							actorProfileId,
							existing: [],
							insecticideBatchIds: products[index]?.insecticideBatchIds ?? [],
						}),
					),
				]),
			);

			const first = saved[0];
			if (saved.length > 1 || first === undefined) {
				toast.success(`Recorded ${saved.length} applications.`);
				await navigate({ to: '/control-operations/chemical' });
				return;
			}
			// Back to the worklist the stop came from; the crew's next move is the
			// next stop, not this record.
			if (missionId !== null) {
				await navigate({ to: '/operations/missions/$id', params: { id: missionId } });
				return;
			}
			await navigate({ to: '/control-operations/chemical/$id', params: { id: first.id } });
		},
		[
			organization,
			actorProfileId,
			applicationId,
			formulations,
			formulationComponents,
			navigate,
			missionItemId,
			missionId,
		],
	);

	return (
		<ApplicationFormPage
			applicationMethods={methods}
			canSubmit={canSubmit}
			defaultValues={defaultApplicationFormValues()}
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
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			submitLabel="Record Application"
			units={units}
			vehicles={vehicles}
		/>
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
	formulations: readonly FormulationRow[],
	formulationComponents: readonly FormulationInsecticideRow[],
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
		id: index === 0 ? firstApplicationId : crypto.randomUUID(),
		insecticideId: amount.insecticideId,
		amountApplied: amount.amount,
		applicationUnitId: amount.unitId,
		insecticideBatchIds: values.componentBatchIds[amount.insecticideId] ?? [],
	}));
}

function nullableSelection(value: string): string | null {
	return value === noSelectionValue || value === '' ? null : value;
}
