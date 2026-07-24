import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	BiocontrolActionRow,
	ControlMethodRow,
	ProfileRow,
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
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import {
	BiocontrolFormPage,
	type BiocontrolFormValues,
	type DrawGeometry,
	noTechnicianValue,
} from './-biocontrol-form';

const biocontrolGcTimeMs = 30_000;

export const Route = createFileRoute('/control-operations/biocontrol/$id_/edit')({
	component: EditBiocontrolActionRoute,
});

function EditBiocontrolActionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.biocontrolMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	// biocontrolActions is on-demand; status-gated useLiveQuery (not suspense)
	// avoids the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: biocontrolGcTimeMs,
			query: (query) =>
				query
					.from({ action: webCollections.biocontrolActions })
					.where(({ action }) => eq(action.id, id))
					.findOne(),
		},
		[id],
	);
	const action = result.data as BiocontrolActionRow | undefined;

	if (result.isError) {
		return <EditUnavailable description="This biocontrol action could not be loaded." />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (action === undefined) {
		return (
			<EditUnavailable description="This biocontrol action could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditBiocontrolActionLoader
			action={action}
			actorProfileId={actorProfileId}
			biocontrolMethods={methods}
			canSubmit={organization !== null && actorProfileId !== null}
			profiles={profiles}
			units={units}
		/>
	);
}

function EditBiocontrolActionLoader({
	action,
	biocontrolMethods,
	units,
	profiles,
	actorProfileId,
	canSubmit,
}: {
	readonly action: BiocontrolActionRow;
	readonly biocontrolMethods: readonly ControlMethodRow[];
	readonly units: readonly UnitRow[];
	readonly profiles: readonly ProfileRow[];
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
			readonly values: BiocontrolFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			if (values.amountReleased === null) {
				throw new Error('Enter how much was released.');
			}
			const nextAmount = values.amountReleased;
			const nextTechnicianId =
				values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId;

			// The point (geometry) and the address are independent: only send a location
			// source (and reseed the optimistic centroid) when the user actually refined
			// the point; the address is a plain field change.
			const refinedPoint = geometryChanged && geometry !== null;
			const locationSource = refinedPoint
				? ({ kind: 'geometry', geometry: geometry as unknown as GeoJsonGeometry } as const)
				: undefined;
			const nextCentroid = refinedPoint
				? ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry)
				: null;

			const now = new Date().toISOString();
			// Inlined so TanStack DB infers the mutable draft type.
			const applyEdits = (draft: BiocontrolActionRow) => {
				const writable = draft as {
					-readonly [K in keyof BiocontrolActionRow]: BiocontrolActionRow[K];
				};
				writable.biocontrolMethodId = values.biocontrolMethodId;
				writable.technicianProfileId = nextTechnicianId;
				writable.biocontrolDate = values.biocontrolDate;
				writable.amountReleased = nextAmount;
				writable.releaseUnitId = values.releaseUnitId;
				writable.addressId = values.addressId;
				writable.habitatId = values.habitatId;
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
					? webCollections.biocontrolActions.update(action.id, applyEdits)
					: webCollections.biocontrolActions.update(
							action.id,
							{ metadata: { locationSource } },
							applyEdits,
						);
			await transaction.isPersisted.promise;
			await navigate({ to: '/control-operations/biocontrol/$id', params: { id: action.id } });
		},
		[action, actorProfileId, navigate],
	);

	return (
		<BiocontrolFormPage
			biocontrolMethods={biocontrolMethods}
			canSubmit={canSubmit}
			defaultValues={defaultsFromAction(action)}
			header={{
				title: 'Edit biocontrol',
				description: 'Update this release’s method, amount, date, context, or location.',
				backTo: '/control-operations/biocontrol/$id',
				backParams: { id: action.id },
				backLabel: 'Back to biocontrol action',
			}}
			initialGeometry={pointFromAction(action)}
			initialPreviewGeometry={pointFromAction(action) as unknown as GeoJsonGeometry}
			onSave={onSave}
			organizationId={action.organizationId}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save changes"
			units={units}
		/>
	);
}

function pointFromAction(action: BiocontrolActionRow): DrawGeometry {
	return { type: 'Point', coordinates: [action.lng, action.lat] };
}

function defaultsFromAction(action: BiocontrolActionRow): BiocontrolFormValues {
	return {
		addressId: action.addressId,
		habitatId: action.habitatId,
		biocontrolMethodId: action.biocontrolMethodId,
		technicianProfileId: action.technicianProfileId ?? noTechnicianValue,
		biocontrolDate: action.biocontrolDate.slice(0, 10),
		amountReleased: action.amountReleased,
		releaseUnitId: action.releaseUnitId,
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
					<EmptyTitle>Biocontrol Action Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
