import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	ControlMethodRow,
	ProfileRow,
	SourceReductionRow,
	UnitRow,
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
import {
	SOURCE_REDUCTION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import {
	noTechnicianValue,
	SourceReductionFormPage,
	type SourceReductionFormValues,
	type SourceReductionSaveInput,
} from './-source-reduction-form';

const sourceReductionGcTimeMs = 30_000;

export const Route = createFileRoute('/control-operations/source-reduction/$id_/edit')({
	component: EditSourceReductionRoute,
});

function EditSourceReductionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(
		webCollections.sourceReductionMethods,
	);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

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
		return <EditUnavailable description="This source reduction action could not be loaded." />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (sourceReduction === undefined) {
		return (
			<EditUnavailable description="This source reduction action could not be found, or you do not have access to it." />
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
	readonly methods: readonly ControlMethodRow[];
	readonly units: readonly UnitRow[];
	readonly profiles: readonly ProfileRow[];
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
			await navigate({
				to: '/control-operations/source-reduction/$id',
				params: { id: sourceReduction.id },
			});
		},
		[sourceReduction, actorProfileId, navigate],
	);

	if (geometryQuery.isError) {
		return <EditUnavailable description="This source reduction's geometry could not be loaded." />;
	}
	if (geometryQuery.isPending) {
		return <EditFormSkeleton />;
	}

	return (
		<SourceReductionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultsFromSourceReduction(sourceReduction)}
			header={{
				title: 'Edit source reduction',
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
): SourceReductionFormValues {
	return {
		sourceReductionMethodId: sourceReduction.sourceReductionMethodId,
		sourcesEliminatedAmount: sourceReduction.sourcesEliminatedAmount,
		sourcesEliminatedUnitId: sourceReduction.sourcesEliminatedUnitId,
		sourceReductionDate: sourceReduction.sourceReductionDate.slice(0, 10),
		technicianProfileId: sourceReduction.technicianProfileId ?? noTechnicianValue,
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

function EditUnavailable({ description }: { readonly description: string }) {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-8">
			<Empty className="max-w-md border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>Source Reduction Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
