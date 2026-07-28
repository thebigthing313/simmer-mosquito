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
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { asMetadataValue } from '../../../forms/field-components';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import {
	ApplicationFormPage,
	type ApplicationFormValues,
	type DrawGeometry,
	noSelectionValue,
} from './-application-form';

export const Route = createFileRoute('/control-operations/chemical/$id_/edit')({
	component: EditApplicationRoute,
});

const applicationGcTimeMs = 30_000;

function EditApplicationRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.applicationMethods);
	const { rows: insecticides } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: vehicles } = useCollectionRows<VehicleRow>(webCollections.vehicles);
	const { rows: equipment } = useCollectionRows<EquipmentRow>(webCollections.equipment);

	// applications is on-demand: the id-scoped subset drives the shape, and the
	// status-gated useLiveQuery (not the suspense variant) avoids the post-unmount
	// hang over on-demand collections.
	const result = useLiveQuery(
		{
			gcTime: applicationGcTimeMs,
			query: (query) =>
				query
					.from({ application: webCollections.applications })
					.where(({ application }) => eq(application.id, id))
					.findOne(),
		},
		[id],
	);
	const application = result.data as ApplicationRow | undefined;

	if (result.isError) {
		return <EditUnavailable description="This application could not be loaded." />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (application === undefined) {
		return (
			<EditUnavailable description="This application could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditApplicationLoader
			actorProfileId={actorProfileId}
			application={application}
			applicationMethods={methods}
			canSubmit={organization !== null && actorProfileId !== null}
			equipment={equipment}
			insecticides={insecticides}
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
	actorProfileId,
	canSubmit,
}: {
	readonly application: ApplicationRow;
	readonly applicationMethods: readonly ControlMethodRow[];
	readonly insecticides: readonly InsecticideRow[];
	readonly units: readonly UnitRow[];
	readonly profiles: readonly ProfileRow[];
	readonly vehicles: readonly VehicleRow[];
	readonly equipment: readonly EquipmentRow[];
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();

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

			// The point (geometry) and the address are independent: only send a
			// location source (and reseed the optimistic centroid) when the user
			// actually refined the point; the address is a plain field change.
			const refinedPoint = geometryChanged && geometry !== null;
			const locationSource = refinedPoint
				? ({ kind: 'geometry', geometry: geometry as unknown as GeoJsonGeometry } as const)
				: undefined;
			const nextCentroid = refinedPoint
				? ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry)
				: null;

			const nextAmount = values.amountApplied;
			const now = new Date().toISOString();
			// Inlined so TanStack DB infers the mutable draft type.
			const applyEdits = (draft: ApplicationRow) => {
				const writable = draft as { -readonly [K in keyof ApplicationRow]: ApplicationRow[K] };
				writable.insecticideId = values.insecticideId;
				writable.amountApplied = nextAmount;
				writable.applicationUnitId = values.applicationUnitId;
				writable.applicationDate = values.applicationDate;
				writable.applicationMethodId = nullableSelection(values.applicationMethodId);
				writable.applicatorProfileId = nullableSelection(values.applicatorProfileId);
				writable.vehicleId = nullableSelection(values.vehicleId);
				writable.equipmentId = nullableSelection(values.equipmentId);
				writable.addressId = values.addressId;
				writable.habitatId = values.habitatId;
				writable.metadata = values.metadata;
				if (nextCentroid !== null) {
					writable.lat = nextCentroid.lat;
					writable.lng = nextCentroid.lng;
					writable.geomType = nextCentroid.geomType;
				}
				if (actorProfileId !== null) {
					writable.updatedByProfileId = actorProfileId;
				}
				writable.updatedAt = now;
			};

			const transaction =
				locationSource === undefined
					? webCollections.applications.update(application.id, applyEdits)
					: webCollections.applications.update(
							application.id,
							{ metadata: { locationSource } },
							applyEdits,
						);
			await settleWrite(transaction);
			await navigate({ to: '/control-operations/chemical/$id', params: { id: application.id } });
		},
		[application, actorProfileId, navigate],
	);

	return (
		<ApplicationFormPage
			applicationMethods={applicationMethods}
			canSubmit={canSubmit}
			defaultValues={defaultsFromApplication(application)}
			equipment={equipment}
			header={{
				title: 'Edit Application',
				description: 'Update this application’s product, amount, work details, or location.',
				backTo: '/control-operations/chemical/$id',
				backParams: { id: application.id },
				backLabel: 'Back to application',
			}}
			initialGeometry={pointFromApplication(application)}
			initialPreviewGeometry={pointFromApplication(application) as unknown as GeoJsonGeometry}
			insecticides={insecticides}
			onSave={onSave}
			organizationId={application.organizationId}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save Changes"
			units={units}
			vehicles={vehicles}
		/>
	);
}

function pointFromApplication(application: ApplicationRow): DrawGeometry {
	return { type: 'Point', coordinates: [application.lng, application.lat] };
}

function defaultsFromApplication(application: ApplicationRow): ApplicationFormValues {
	return {
		insecticideId: application.insecticideId,
		amountApplied: application.amountApplied,
		applicationUnitId: application.applicationUnitId,
		applicationDate: application.applicationDate.slice(0, 10),
		applicationMethodId: application.applicationMethodId ?? noSelectionValue,
		applicatorProfileId: application.applicatorProfileId ?? noSelectionValue,
		vehicleId: application.vehicleId ?? noSelectionValue,
		equipmentId: application.equipmentId ?? noSelectionValue,
		addressId: application.addressId,
		habitatId: application.habitatId,
		metadata: asMetadataValue(application.metadata),
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

function EditUnavailable({ description }: { readonly description: string }) {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-8">
			<Empty className="max-w-md border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>Application Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
