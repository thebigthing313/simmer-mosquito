import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { SourceReductionRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import {
	type AdditionalPersonnelResult,
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { RecordUnavailable } from '../../../components/record';
import {
	type SchemaCatalogListing,
	useSourceReductionMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { type UnitLabel, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import {
	SOURCE_REDUCTION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	noTechnicianValue,
	SourceReductionFormPage,
	type SourceReductionFormValues,
	type SourceReductionSaveInput,
} from './-source-reduction-form';

const sourceReductionGcTimeMs = 30_000;

export const Route = createFileRoute('/control-operations/source-reduction/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/control-operations/source-reduction/$id',
			});
		}
	},
	component: EditSourceReductionRoute,
});

function EditSourceReductionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useSourceReductionMethodRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();

	// sourceReductions is on-demand; status-gated useLiveQuery (not suspense) avoids
	// the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: sourceReductionGcTimeMs,
			query: (query) =>
				query
					.from({ sourceReduction: webCollections.sourceReductions })
					.where(({ sourceReduction }) => eq(sourceReduction.id, id))
					.findOne(),
		},
		[id],
	);
	const sourceReduction = result.data as SourceReductionRow | undefined;

	if (result.isError) {
		return (
			<RecordUnavailable
				layout="centered"
				noun="source reduction action"
				reason="error"
				title="Source Reduction Unavailable"
			/>
		);
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (sourceReduction === undefined) {
		return (
			<RecordUnavailable
				layout="centered"
				noun="source reduction action"
				reason="not-found"
				title="Source Reduction Unavailable"
			/>
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditSourceReductionLoader
			actorProfileId={actorProfileId}
			canSubmit={organization !== null && actorProfileId !== null}
			methods={methods}
			profiles={profiles}
			sourceReduction={sourceReduction}
			units={units}
		/>
	);
}

function EditSourceReductionLoader({
	sourceReduction,
	methods,
	units,
	profiles,
	actorProfileId,
	canSubmit,
}: {
	readonly sourceReduction: SourceReductionRow;
	readonly methods: readonly SchemaCatalogListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(
		SOURCE_REDUCTION_GEOMETRY_SOURCE,
		sourceReduction.id,
		sourceReduction.updatedAt,
	);
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'sourceReduction', id: sourceReduction.id });

	const onSave = useCallback(
		async ({ values, geometry, geometryChanged }: SourceReductionSaveInput) => {
			if (values.sourcesEliminatedAmount === null) {
				throw new Error('Enter how many sources were eliminated.');
			}
			const nextAmount = values.sourcesEliminatedAmount;
			const nextTechnicianId =
				values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId;

			// The point and the address/habitat are independent: only send a location
			// source (and reseed the optimistic centroid) when the user actually refined
			// the point; the rest are plain field changes.
			const refinedPoint = geometryChanged && geometry !== null;
			const locationSource = refinedPoint
				? ({ kind: 'geometry', geometry: geometry as unknown as GeoJsonGeometry } as const)
				: undefined;
			const nextCentroid = refinedPoint
				? ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry)
				: null;

			const now = new Date().toISOString();
			// Inlined so TanStack DB infers the mutable draft type.
			const applyEdits = (draft: SourceReductionRow) => {
				const writable = draft as {
					-readonly [K in keyof SourceReductionRow]: SourceReductionRow[K];
				};
				writable.sourceReductionMethodId = values.sourceReductionMethodId;
				writable.technicianProfileId = nextTechnicianId;
				writable.sourceReductionDate = values.sourceReductionDate;
				writable.sourcesEliminatedAmount = nextAmount;
				writable.sourcesEliminatedUnitId = values.sourcesEliminatedUnitId;
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
					? webCollections.sourceReductions.update(sourceReduction.id, applyEdits)
					: webCollections.sourceReductions.update(
							sourceReduction.id,
							{ metadata: { locationSource } },
							applyEdits,
						);
			await settleWrite(transaction);
			await saveAdditionalPersonnel({
				target: { type: 'sourceReduction', id: sourceReduction.id },
				organizationId: sourceReduction.organizationId,
				actorProfileId,
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({
				to: '/control-operations/source-reduction/$id',
				params: { id: sourceReduction.id },
			});
		},
		[sourceReduction, actorProfileId, personnel.rows, navigate],
	);

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This source reduction's geometry could not be loaded."
				layout="centered"
				noun="source reduction action"
				reason="error"
				title="Source Reduction Unavailable"
			/>
		);
	}
	if (personnel.isError) {
		return (
			<RecordUnavailable
				description="This source reduction's personnel could not be loaded."
				layout="centered"
				noun="source reduction action"
				reason="error"
				title="Source Reduction Unavailable"
			/>
		);
	}
	if (geometryQuery.isPending || !personnel.isReady) {
		return <EditFormSkeleton />;
	}

	return (
		<SourceReductionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultsFromSourceReduction(sourceReduction, personnel)}
			header={{
				title: 'Edit Source Reduction',
				description: 'Update what was eliminated, who did it, when, or where.',
				backTo: '/control-operations/source-reduction/$id',
				backParams: { id: sourceReduction.id },
				backLabel: 'Back to source reduction',
			}}
			initialGeometry={geometryQuery.geometry}
			methods={methods}
			onSave={onSave}
			organizationId={sourceReduction.organizationId}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save changes"
			units={units}
		/>
	);
}

function defaultsFromSourceReduction(
	sourceReduction: SourceReductionRow,
	personnel: AdditionalPersonnelResult,
): SourceReductionFormValues {
	return {
		sourceReductionMethodId: sourceReduction.sourceReductionMethodId,
		sourcesEliminatedAmount: sourceReduction.sourcesEliminatedAmount,
		sourcesEliminatedUnitId: sourceReduction.sourcesEliminatedUnitId,
		sourceReductionDate: sourceReduction.sourceReductionDate.slice(0, 10),
		technicianProfileId: sourceReduction.technicianProfileId ?? noTechnicianValue,
		additionalPersonnelIds: personnel.profileIds,
		addressId: sourceReduction.addressId,
		habitatId: sourceReduction.habitatId,
		metadata: asMetadataValue(sourceReduction.metadata),
	};
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
