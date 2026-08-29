import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { RecordUnavailable } from '../../../components/record';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useApplicationMutations } from '../../../hooks/mutations/use-application-mutations';
import type { ChemicalApplication } from '../../../hooks/queries/control-action-view';
import {
	type AdditionalPersonnelResult,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import { useApplication } from '../../../hooks/queries/use-application';
import {
	type ApplicationBatchesResult,
	useApplicationBatches,
} from '../../../hooks/queries/use-application-batches';
import {
	type SchemaCatalogListing,
	useApplicationMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import {
	type InsecticideListing,
	type RigListing,
	useEquipmentRoster,
	useInsecticideRoster,
	useVehicleRoster,
} from '../../../hooks/queries/use-chemical-rosters';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { type UnitLabel, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { CHEMICAL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	ApplicationFormPage,
	type ApplicationFormValues,
	type DrawGeometry,
	noSelectionValue,
} from './-application-form';

export const Route = createFileRoute('/control-operations/chemical/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/control-operations/chemical/$id',
			});
		}
	},
	component: EditApplicationRoute,
});

const applicationGcTimeMs = 30_000;

function EditApplicationRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useApplicationMethodRoster();
	const insecticides = useInsecticideRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();
	const vehicles = useVehicleRoster();
	const equipment = useEquipmentRoster();

	// One query for the application and everything named on it. `applications` is
	// on-demand, so this is status-gated rather than suspending; see the hook.
	const { application, isReady, isError } = useApplication(id, { gcTime: applicationGcTimeMs });

	if (isError) {
		return <RecordUnavailable layout="centered" noun="application" reason="error" />;
	}
	if (!isReady) {
		return <EditFormSkeleton />;
	}
	if (application === undefined) {
		return <RecordUnavailable layout="centered" noun="application" reason="not-found" />;
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditApplicationLoader
			application={application}
			applicationMethods={methods}
			canSubmit={organization !== null && actorProfileId !== null}
			equipment={equipment}
			insecticides={insecticides}
			organizationId={organization?.id ?? ''}
			profiles={profiles}
			units={units}
			vehicles={vehicles}
		/>
	);
}

function EditApplicationLoader({
	application,
	applicationMethods,
	insecticides,
	units,
	profiles,
	vehicles,
	equipment,
	canSubmit,
	organizationId,
}: {
	readonly application: ChemicalApplication;
	readonly applicationMethods: readonly SchemaCatalogListing[];
	readonly insecticides: readonly InsecticideListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly vehicles: readonly RigListing[];
	readonly equipment: readonly RigListing[];
	readonly canSubmit: boolean;
	readonly organizationId: string;
}) {
	const navigate = useNavigate();
	const { update, setBatches } = useApplicationMutations();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(
		CHEMICAL_GEOMETRY_SOURCE,
		application.id,
		application.updatedAt.toISOString(),
	);
	// Crew and batches live in their own tables; the form edits them as lists and
	// the save reconciles each against what is attached now. Unlike a create, where
	// the batches ride in the application's own command, an edit adds and removes
	// links one at a time — they are their own commands with their own permissions.
	const personnel = useAdditionalPersonnel({ type: 'application', id: application.id });
	const { setPersonnel } = useAdditionalPersonnelMutations();
	const batches = useApplicationBatches(application.id);

	const onSave = useCallback(
		async ({
			values,
			geometry,
			geometryChanged,
		}: {
			readonly values: ApplicationFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			if (values.amountApplied === null) {
				throw new Error('Enter the amount applied.');
			}

			// The shape and the address are independent: only state a location when the
			// user actually redrew it. Absent means "leave it", which is not the same
			// request as re-sending the shape it already has.
			const redrawn =
				geometryChanged && geometry !== null ? (geometry as unknown as GeoJsonGeometry) : null;
			const centroid = redrawn === null ? null : ownedCentroidFromGeoJson(redrawn);

			// Which commands this save means is worked out by the hook, from what
			// actually moved — the field details and the placement are different
			// builders, and naming one with nothing to read is refused.
			await update(application, {
				values: {
					insecticideId: values.insecticideId,
					amountApplied: values.amountApplied,
					unitId: values.applicationUnitId,
					actionDate: values.applicationDate,
					methodId: nullableSelection(values.applicationMethodId),
					applicatorProfileId: nullableSelection(values.applicatorProfileId),
					vehicleId: nullableSelection(values.vehicleId),
					equipmentId: nullableSelection(values.equipmentId),
					addressId: values.addressId,
					habitatId: values.habitatId,
					metadata: values.metadata,
				},
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
			await Promise.all([
				setPersonnel({
					target: { type: 'application', id: application.id },
					existing: personnel.rows,
					profileIds: values.additionalPersonnelIds,
				}),
				setBatches({
					applicationId: application.id,
					existing: batches.rows,
					insecticideBatchIds: values.insecticideBatchIds,
				}),
			]);
			await navigate({ to: '/control-operations/chemical/$id', params: { id: application.id } });
		},
		[application, personnel.rows, batches.rows, navigate, update, setBatches, setPersonnel],
	);

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This application's geometry could not be loaded."
				layout="centered"
				noun="application"
				reason="error"
			/>
		);
	}
	if (personnel.isError || batches.isError) {
		return (
			<RecordUnavailable
				description="This application's personnel and batches could not be loaded."
				layout="centered"
				noun="application"
				reason="error"
			/>
		);
	}
	if (geometryQuery.isPending || !personnel.isReady || !batches.isReady) {
		return <EditFormSkeleton />;
	}

	return (
		<ApplicationFormPage
			applicationMethods={applicationMethods}
			mode="edit"
			canSubmit={canSubmit}
			defaultValues={defaultsFromApplication(application, personnel, batches)}
			equipment={equipment}
			header={{
				title: 'Edit Application',
				description: 'Update this application’s product, amount, work details, or location.',
				backTo: '/control-operations/chemical/$id',
				backParams: { id: application.id },
				backLabel: 'Back to application',
			}}
			initialGeometry={geometryQuery.geometry}
			insecticides={insecticides}
			onSave={onSave}
			organizationId={organizationId}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save Changes"
			units={units}
			vehicles={vehicles}
		/>
	);
}

function defaultsFromApplication(
	application: ChemicalApplication,
	personnel: AdditionalPersonnelResult,
	batches: ApplicationBatchesResult,
): ApplicationFormValues {
	return {
		// A saved application holds one product: it never records the mix it may
		// have been calculated from, so editing is always single-product.
		productMode: 'insecticide',
		insecticideId: application.insecticideId,
		formulationId: '',
		componentBatchIds: {},
		amountApplied: application.amountApplied,
		applicationUnitId: application.unitId,
		applicationDate: application.actionDate.slice(0, 10),
		applicationMethodId: application.methodId ?? noSelectionValue,
		applicatorProfileId: application.applicatorProfileId ?? noSelectionValue,
		additionalPersonnelIds: personnel.profileIds,
		insecticideBatchIds: batches.insecticideBatchIds,
		vehicleId: application.vehicleId ?? noSelectionValue,
		equipmentId: application.equipmentId ?? noSelectionValue,
		addressId: application.addressId,
		habitatId: application.habitatId,
		metadata: asMetadataValue(application.metadata),
		// Create-only field; the detail page's thread is where an edit adds a note.
		comment: '',
	};
}

function nullableSelection(value: string): string | null {
	return value === noSelectionValue || value === '' ? null : value;
}

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
				<Skeleton className="h-24 w-full" />
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}
