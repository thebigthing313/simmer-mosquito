import { ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
	type DrawGeometry,
	TreatmentFormPage,
} from '../../../components/control-operations/chemical/treatment-form';
import {
	noSelectionValue,
	type TreatmentFormValues,
	treatmentSaveInput,
} from '../../../components/control-operations/chemical/treatment-form-values';
import type { TreatmentRecipe } from '../../../components/control-operations/chemical/treatment-line-values';
import { EditFormSkeleton, RecordEditFrame, RecordUnavailable } from '../../../components/record';
import { canAttributeWrite } from '../../../hooks/mutations/shared';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useTreatmentMutations } from '../../../hooks/mutations/use-treatment-mutations';
import { catalogs } from '../../../hooks/queries/catalog-register';
import type { SchemaCatalogListing } from '../../../hooks/queries/catalog-roster-view';
import type {
	FormulationComponentListing,
	FormulationListing,
	InsecticideListing,
	RigListing,
} from '../../../hooks/queries/chemical-roster-view';
import type { TreatmentDetail } from '../../../hooks/queries/control-action-view';
import {
	type AdditionalPersonnelResult,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import { useCatalogRoster } from '../../../hooks/queries/use-catalog-roster';
import { useFormulationComponentRoster } from '../../../hooks/queries/use-formulation-component-roster';
import { useFormulationRoster } from '../../../hooks/queries/use-formulation-roster';
import { useInsecticideRoster } from '../../../hooks/queries/use-insecticide-roster';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useTreatment } from '../../../hooks/queries/use-treatment';
import {
	type TreatmentBatchLink,
	useTreatmentBatchLinks,
} from '../../../hooks/queries/use-treatment-batch-links';
import { type UnitLabel, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { CHEMICAL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { recordNoun } from '../../../lib/record-nouns';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/control-operations/chemical/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/control-operations/chemical/$id/edit')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/control-operations/chemical/$id',
			});
		}
	},
	component: EditTreatmentRoute,
});

function EditTreatmentRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useCatalogRoster(catalogs.applicationMethods);
	const insecticides = useInsecticideRoster();
	const formulations = useFormulationRoster();
	const formulationComponents = useFormulationComponentRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();
	const vehicles = useCatalogRoster(catalogs.vehicles);
	const equipment = useCatalogRoster(catalogs.equipment);

	// The Treatment and its lines in one read. `treatments` is on-demand, so this
	// is status-gated rather than suspending.
	const { treatment, isReady, isError } = useTreatment(id);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<RecordEditFrame
			recordType="treatment"
			reading={{ isError, isReady, record: treatment }}
			skeleton={<EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />}
		>
			{(record) => (
				<EditTreatmentLoader
					applicationMethods={methods}
					canSubmit={canAttributeWrite({ organization, actorProfileId })}
					equipment={equipment}
					formulationComponents={formulationComponents}
					formulations={formulations}
					insecticides={insecticides}
					organizationId={organization.id}
					profiles={profiles}
					treatment={record}
					units={units}
					vehicles={vehicles}
				/>
			)}
		</RecordEditFrame>
	);
}

function EditTreatmentLoader({
	treatment,
	applicationMethods,
	insecticides,
	formulations,
	formulationComponents,
	units,
	profiles,
	vehicles,
	equipment,
	canSubmit,
	organizationId,
}: {
	readonly treatment: TreatmentDetail;
	readonly applicationMethods: readonly SchemaCatalogListing[];
	readonly insecticides: readonly InsecticideListing[];
	readonly formulations: readonly FormulationListing[];
	readonly formulationComponents: readonly FormulationComponentListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly vehicles: readonly RigListing[];
	readonly equipment: readonly RigListing[];
	readonly canSubmit: boolean;
	readonly organizationId: string;
}) {
	const navigate = useNavigate();
	const { update } = useTreatmentMutations();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(
		CHEMICAL_GEOMETRY_SOURCE,
		treatment.id,
		treatment.updatedAt.toISOString(),
	);
	// The crew live in their own table and reconcile after the save. The batch
	// links ride in the save itself, so a kept lot needs its stored link id.
	const personnel = useAdditionalPersonnel({ type: 'treatment', id: treatment.id });
	const { setPersonnel } = useAdditionalPersonnelMutations();
	const links = useTreatmentBatchLinks(treatment.lines.map((line) => line.id));

	const onSave = async ({
		values,
		recipe,
		geometry,
		geometryChanged,
	}: {
		readonly values: TreatmentFormValues;
		readonly recipe: TreatmentRecipe;
		readonly geometry: DrawGeometry | null;
		readonly geometryChanged: boolean;
	}) => {
		// The shape and the address are independent: only state a location when the
		// user redrew it. Absent means "leave it".
		const redrawn = geometryChanged && geometry !== null ? geometry : null;
		const centroid = redrawn === null ? null : ownedCentroidFromGeoJson(redrawn);

		// One PATCH: the header intents this save touched beside
		// `reviseTreatmentLines` with the full set, so the lines on screen are
		// confirmed with the header. The hook works out which from what moved.
		await update(treatment, {
			...treatmentSaveInput(values, recipe),
			savedLinks: links.rows,
			...(centroid === null || redrawn === null
				? {}
				: {
						location: {
							lat: centroid.lat,
							lng: centroid.lng,
							geomType: centroid.geomType,
							locationSource: { kind: 'geometry', geometry: redrawn },
						},
					}),
		});
		// The Treatment has landed by now, so a miss on the crew is reported rather
		// than thrown (see attachLinksBestEffort).
		await attachLinksBestEffort(
			'the additional personnel',
			() =>
				setPersonnel({
					target: { type: 'treatment', id: treatment.id },
					existing: personnel.rows,
					profileIds: values.additionalPersonnelIds,
				}),
			{ write: 'change', recordType: 'treatment' },
		);
		await navigate({ to: '/control-operations/chemical/$id', params: { id: treatment.id } });
	};

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This treatment's geometry could not be loaded."
				layout="centered"
				recordType="treatment"
				reason="error"
			/>
		);
	}
	if (personnel.isError || links.isError) {
		return (
			<RecordUnavailable
				description="This treatment's personnel and batches could not be loaded."
				layout="centered"
				recordType="treatment"
				reason="error"
			/>
		);
	}
	if (geometryQuery.isPending || !personnel.isReady || !links.isReady) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />;
	}

	return (
		<TreatmentFormPage
			applicationMethods={applicationMethods}
			mode="edit"
			canSubmit={canSubmit}
			defaultValues={defaultsFromTreatment(treatment, personnel, links.rows)}
			equipment={equipment}
			formulationComponents={formulationComponents}
			formulations={formulations}
			header={{
				title: `Edit ${recordNoun('treatment').title}`,
				backTo: '/control-operations/chemical/$id',
				backParams: { id: treatment.id },
				backLabel: 'Back to treatment',
			}}
			initialGeometry={geometryQuery.geometry}
			insecticides={insecticides}
			onSave={onSave}
			organizationId={organizationId}
			profiles={profiles}
			requireLocation={false}
			missionStop={null}
			units={units}
			vehicles={vehicles}
		/>
	);
}

/**
 * The saved Treatment as form values. A Treatment mixed from a Formulation
 * opens on its saved lines, not a recomputation; changing the mix total is what
 * recomputes them.
 */
function defaultsFromTreatment(
	treatment: TreatmentDetail,
	personnel: AdditionalPersonnelResult,
	links: readonly TreatmentBatchLink[],
): TreatmentFormValues {
	return {
		entry: treatment.formulationId === null ? 'products' : 'formulation',
		formulationId: treatment.formulationId ?? '',
		mixAmount: treatment.mixAmount,
		lines: treatment.lines.map((line) => {
			const lineLinks = links.filter((link) => link.applicationId === line.id);
			return {
				id: line.id,
				insecticideId: line.insecticideId,
				amount: line.amount,
				unitId: line.unitId,
				batchIds: [...new Set(lineLinks.map((link) => link.insecticideBatchId))],
				stored: true,
				removed: false,
				savedBatchCount: lineLinks.length,
			};
		}),
		applicationDate: treatment.actionDate.slice(0, 10),
		applicationMethodId: treatment.methodId ?? noSelectionValue,
		applicatorProfileId: treatment.applicatorProfileId ?? noSelectionValue,
		additionalPersonnelIds: personnel.profileIds,
		vehicleId: treatment.vehicleId ?? noSelectionValue,
		equipmentId: treatment.equipmentId ?? noSelectionValue,
		addressId: treatment.addressId,
		habitatId: treatment.habitatId,
		metadata: asMetadataValue(treatment.metadata),
		// Create-only field; the detail page's thread is where an edit adds a note.
		comment: '',
	};
}
