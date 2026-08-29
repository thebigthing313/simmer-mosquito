import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { RecordUnavailable } from '../../../components/record';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useSourceReductionMutations } from '../../../hooks/mutations/use-source-reduction-mutations';
import type { SourceReduction } from '../../../hooks/queries/control-action-view';
import {
	type AdditionalPersonnelResult,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import {
	type SchemaCatalogListing,
	useSourceReductionMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useSourceReduction } from '../../../hooks/queries/use-source-reduction';
import { type UnitLabel, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import {
	SOURCE_REDUCTION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	noTechnicianValue,
	SourceReductionFormPage,
	type SourceReductionFormValues,
	type SourceReductionSaveInput,
	sourceReductionFieldsFrom,
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

	const {
		action: sourceReduction,
		isReady,
		isError,
	} = useSourceReduction(id, { gcTime: sourceReductionGcTimeMs });

	if (isError) {
		return (
			<RecordUnavailable
				layout="centered"
				noun="source reduction action"
				reason="error"
				title="Source Reduction Unavailable"
			/>
		);
	}
	if (!isReady) {
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
			canSubmit={organization !== null && actorProfileId !== null}
			methods={methods}
			organizationId={organization?.id ?? ''}
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
	canSubmit,
	organizationId,
}: {
	readonly sourceReduction: SourceReduction;
	readonly methods: readonly SchemaCatalogListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly canSubmit: boolean;
	readonly organizationId: string;
}) {
	const navigate = useNavigate();
	const { update } = useSourceReductionMutations();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(
		SOURCE_REDUCTION_GEOMETRY_SOURCE,
		sourceReduction.id,
		sourceReduction.updatedAt.toISOString(),
	);
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'sourceReduction', id: sourceReduction.id });
	const { setPersonnel } = useAdditionalPersonnelMutations();

	const onSave = useCallback(
		async ({ values, geometry, geometryChanged }: SourceReductionSaveInput) => {
			if (values.sourcesEliminatedAmount === null) {
				throw new Error('Enter how many sources were eliminated.');
			}
			// The point and the address/habitat are independent: only state a location
			// when the user actually refined the point. Absent means "leave it", which
			// is not the same request as re-sending the shape it already has.
			const refinedShape =
				geometryChanged && geometry !== null ? (geometry as unknown as GeoJsonGeometry) : null;
			const centroid = refinedShape === null ? null : ownedCentroidFromGeoJson(refinedShape);

			// Which commands this save means is worked out by the hook, from what
			// actually moved — the field details and the placement are different
			// builders, and naming one with nothing to read is refused.
			await update(sourceReduction, {
				values: sourceReductionFieldsFrom(values),
				...(centroid === null || refinedShape === null
					? {}
					: {
							location: {
								lat: centroid.lat,
								lng: centroid.lng,
								geomType: centroid.geomType,
								locationSource: { kind: 'geometry', geometry: refinedShape },
							},
						}),
			});
			await setPersonnel({
				target: { type: 'sourceReduction', id: sourceReduction.id },
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({
				to: '/control-operations/source-reduction/$id',
				params: { id: sourceReduction.id },
			});
		},
		[sourceReduction, personnel.rows, navigate, update, setPersonnel],
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
			mode="edit"
			onSave={onSave}
			organizationId={organizationId}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save changes"
			units={units}
		/>
	);
}

function defaultsFromSourceReduction(
	sourceReduction: SourceReduction,
	personnel: AdditionalPersonnelResult,
): SourceReductionFormValues {
	return {
		sourceReductionMethodId: sourceReduction.methodId,
		sourcesEliminatedAmount: sourceReduction.sourcesEliminated,
		sourcesEliminatedUnitId: sourceReduction.unitId,
		sourceReductionDate: sourceReduction.actionDate.slice(0, 10),
		technicianProfileId: sourceReduction.technicianProfileId ?? noTechnicianValue,
		additionalPersonnelIds: personnel.profileIds,
		addressId: sourceReduction.addressId,
		habitatId: sourceReduction.habitatId,
		metadata: asMetadataValue(sourceReduction.metadata),
		// Create-only field; the detail page's thread is where an edit adds a note.
		comment: '',
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
