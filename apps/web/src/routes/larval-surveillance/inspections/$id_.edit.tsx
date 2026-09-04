import type { ResolvedLarvalInspectionEntryPolicy } from '@simmer-mosquito/domain';
import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { getServerUrl } from '../../../auth';
import { toDrawGeometry } from '../../../components/map/use-map-draw';
import { RecordUnavailable } from '../../../components/record';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useInspectionMutations } from '../../../hooks/mutations/use-inspection-mutations';
import { useSampleMutations } from '../../../hooks/mutations/use-sample-mutations';
import {
	type AdditionalPersonnelLink,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import {
	type SchemaCatalogListing,
	useHabitatTypeRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import {
	type InspectionRecord,
	useInspectionRecord,
} from '../../../hooks/queries/use-inspection-record';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { samples } from '../../../lib/collections/samples';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	type DrawGeometry,
	defaultInspectionFormValues,
	InspectionFormPage,
	type InspectionFormValues,
	inspectionResultOf,
	noHabitatTypeValue,
	unsetDensityValue,
} from './-inspection-form';

export const Route = createFileRoute('/larval-surveillance/inspections/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/larval-surveillance/inspections/$id',
			});
		}
	},
	component: EditInspectionRoute,
});

const inspectionGcTimeMs = 30_000;

function EditInspectionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization, settings } = useOrganizationWorkspace(auth.snapshot);
	const habitatTypes = useHabitatTypeRoster();
	const profiles = useProfileRoster();

	// inspections is an on-demand collection, so this reads live status through
	// useLiveQuery (not the suspense variant, which can hang after a nav unmount).
	const { inspection, isReady, isError } = useInspectionRecord(id);

	// Mounted here rather than inside the loader so the crew subset — and the
	// samples subset below — are already streaming when the save fires; a write
	// over a cold on-demand stream never sees its txid come back.
	const personnel = useAdditionalPersonnel({ type: 'inspection', id });
	useLiveQuery(
		{
			gcTime: inspectionGcTimeMs,
			query: (query) =>
				query.from({ sample: samples() }).where(({ sample }) => eq(sample.inspection_id, id)),
		},
		[id],
	);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="inspection" reason="error" />;
	}
	if (!isReady || !personnel.isReady) {
		return <EditFormSkeleton />;
	}
	if (inspection === undefined) {
		return <RecordUnavailable layout="centered" noun="inspection" reason="not-found" />;
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditInspectionLoader
			canSubmit={organization !== null && actorProfileId !== null}
			existingPersonnel={personnel.rows}
			habitatTypes={habitatTypes}
			inspection={inspection}
			organizationId={organization?.id ?? ''}
			personnelProfileIds={personnel.profileIds}
			policy={settings.larvalSurveillance.inspectionEntryPolicy}
			profiles={profiles}
		/>
	);
}

function EditInspectionLoader({
	inspection,
	habitatTypes,
	profiles,
	policy,
	organizationId,
	canSubmit,
	existingPersonnel,
	personnelProfileIds,
}: {
	readonly inspection: InspectionRecord;
	readonly habitatTypes: readonly SchemaCatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly existingPersonnel: readonly AdditionalPersonnelLink[];
	readonly personnelProfileIds: readonly string[];
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { setPersonnel } = useAdditionalPersonnelMutations();
	const isAdhoc = inspection.habitatId === null;
	const inspectionMutations = useInspectionMutations();
	const sampleMutations = useSampleMutations();

	// Geometry is not part of the Electric shape (ADR 0009), so it comes from the
	// display endpoint. Keyed on updatedAt so reopening after a save loads the
	// current shape, and holding the previous value across that key change so the
	// form is not unmounted mid-save — which would take any error with it.
	const geometryQuery = useQuery({
		queryKey: ['inspection-geometry', inspection.id, inspection.updatedAt.toISOString()],
		queryFn: ({ signal }) => fetchInspectionGeometry(inspection.id, signal),
		placeholderData: (previous) => previous,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const geojson = geometryQuery.data ?? null;
	const initialAdhocGeometry = isAdhoc ? toDrawGeometry(geojson) : null;

	const onSave = useCallback(
		async ({
			values,
			adhocGeometry,
		}: {
			readonly values: InspectionFormValues;
			readonly adhocGeometry: DrawGeometry | null;
			readonly habitatGeometry: GeoJsonGeometry | null;
		}) => {
			// Only an ad-hoc inspection owns its geometry; a habitat one inherits the
			// habitat's, which this form cannot move it off.
			const redrawn =
				isAdhoc && JSON.stringify(adhocGeometry) !== JSON.stringify(initialAdhocGeometry)
					? ((adhocGeometry ?? null) as GeoJsonGeometry | null)
					: null;
			const centroid = redrawn === null ? null : ownedCentroidFromGeoJson(redrawn);
			if (redrawn !== null && centroid === null) {
				throw new Error('Unable to determine the inspection location from the drawn geometry.');
			}

			// The habitat type and the address belong to the location command rather
			// than to the field details, so they are compared as part of the placement
			// — naming `updateInspectionFieldDetails` for them would send a command
			// with no reader for either.
			await inspectionMutations.save({
				inspectionId: inspection.id,
				result: inspectionResultOf(values),
				current: {
					inspectionDate: inspection.inspectionDate,
					inspectedByProfileId: inspection.inspectedByProfileId,
					isWet: inspection.isWet,
					dipCount: inspection.dipCount,
					density: inspection.density,
					larvaeCount: inspection.larvaeCount,
					hasEggs: inspection.hasEggs,
					hasFirstInstar: inspection.hasFirstInstar,
					hasSecondInstar: inspection.hasSecondInstar,
					hasThirdInstar: inspection.hasThirdInstar,
					hasFourthInstar: inspection.hasFourthInstar,
					hasPupae: inspection.hasPupae,
				},
				adhoc: isAdhoc
					? {
							next: {
								geometry: redrawn,
								addressId: values.addressId,
								habitatTypeId:
									values.habitatTypeId === noHabitatTypeValue ? null : values.habitatTypeId,
							},
							current: {
								geometry: null,
								addressId: inspection.addressId,
								habitatTypeId: inspection.habitatTypeId,
							},
						}
					: null,
				centroid,
			});

			// The rest reference the inspection and cannot fail a save that already
			// landed, so each is reported rather than thrown (see attachLinksBestEffort).
			await attachLinksBestEffort('the additional personnel', () =>
				setPersonnel({
					target: { type: 'inspection', id: inspection.id },
					existing: existingPersonnel,
					profileIds: values.additionalPersonnelIds,
				}),
			);

			if (values.samples.length > 0) {
				await attachLinksBestEffort('the samples', async () => {
					for (const sample of values.samples) {
						const label = sample.label.trim();
						await sampleMutations.add({
							sampleId: sample.id,
							inspectionId: inspection.id,
							displayName: label === '' ? null : label,
						});
					}
				});
			}

			// The detail page reads the inspection over HTTP, so its cached copy would
			// still hold the pre-edit values on arrival.
			await queryClient.invalidateQueries({ queryKey: ['inspection-detail', inspection.id] });
			await navigate({ to: '/larval-surveillance/inspections/$id', params: { id: inspection.id } });
		},
		[
			inspection,
			isAdhoc,
			initialAdhocGeometry,
			existingPersonnel,
			navigate,
			queryClient,
			setPersonnel,
			inspectionMutations,
			sampleMutations,
		],
	);

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This inspection's location could not be loaded."
				layout="centered"
				noun="inspection"
				reason="error"
			/>
		);
	}
	if (geometryQuery.isPending) {
		return <EditFormSkeleton />;
	}

	return (
		<InspectionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultsFromInspection(inspection, personnelProfileIds)}
			habitatTypes={habitatTypes}
			header={{
				title: 'Edit Inspection',
				description: 'Revise what this inspection found, or who recorded it.',
				backTo: '/larval-surveillance/inspections/$id',
				backParams: { id: inspection.id },
				backLabel: 'Back to inspection',
			}}
			initialAdhocGeometry={initialAdhocGeometry}
			initialPreviewGeometry={geojson}
			mode="edit"
			onSave={onSave}
			organizationId={organizationId}
			policy={policy}
			profiles={profiles}
			submitLabel="Save changes"
		/>
	);
}

function defaultsFromInspection(
	inspection: InspectionRecord,
	personnelProfileIds: readonly string[],
): InspectionFormValues {
	return {
		...defaultInspectionFormValues(
			inspection.inspectionDate,
			inspection.inspectedByProfileId ?? null,
		),
		locationMode: inspection.habitatId === null ? 'adhoc' : 'habitat',
		habitatId: inspection.habitatId,
		habitatTypeId: inspection.habitatTypeId ?? noHabitatTypeValue,
		addressId: inspection.addressId,
		additionalPersonnelIds: [...personnelProfileIds],
		isWet: inspection.isWet,
		density: inspection.density ?? unsetDensityValue,
		dipCount: inspection.dipCount,
		larvaeCount: inspection.larvaeCount,
		lifeStages: {
			hasEggs: inspection.hasEggs,
			hasFirstInstar: inspection.hasFirstInstar,
			hasSecondInstar: inspection.hasSecondInstar,
			hasThirdInstar: inspection.hasThirdInstar,
			hasFourthInstar: inspection.hasFourthInstar,
			hasPupae: inspection.hasPupae,
		},
	};
}

/** Samples added on this pass. Existing ones are managed from the record. */

async function fetchInspectionGeometry(
	inspectionId: string,
	signal: AbortSignal,
): Promise<GeoJsonGeometry | null> {
	const url = new URL(`/map/inspections/${inspectionId}`, getServerUrl());
	const response = await sessionFetch(url, { credentials: 'include', signal });
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Inspection geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly inspection?: { readonly geojson?: unknown };
	};
	return (body.inspection?.geojson ?? null) as GeoJsonGeometry | null;
}

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-24 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}
