import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { BiocontrolActionRow, ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
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
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { BIOCONTROL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	BiocontrolFormPage,
	type BiocontrolFormValues,
	type DrawGeometry,
	noTechnicianValue,
} from './-biocontrol-form';

const biocontrolGcTimeMs = 30_000;

export const Route = createFileRoute('/control-operations/biocontrol/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/control-operations/biocontrol/$id',
			});
		}
	},
	component: EditBiocontrolActionRoute,
});

function EditBiocontrolActionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.biocontrolMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const profiles = useProfileRoster();

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
		return <RecordUnavailable layout="centered" noun="biocontrol action" reason="error" />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (action === undefined) {
		return <RecordUnavailable layout="centered" noun="biocontrol action" reason="not-found" />;
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
	readonly profiles: readonly ProfileListing[];
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(BIOCONTROL_GEOMETRY_SOURCE, action.id, action.updatedAt);
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'biocontrolAction', id: action.id });

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
					? webCollections.biocontrolActions.update(action.id, applyEdits)
					: webCollections.biocontrolActions.update(
							action.id,
							{ metadata: { locationSource } },
							applyEdits,
						);
			await settleWrite(transaction);
			await saveAdditionalPersonnel({
				target: { type: 'biocontrolAction', id: action.id },
				organizationId: action.organizationId,
				actorProfileId,
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({ to: '/control-operations/biocontrol/$id', params: { id: action.id } });
		},
		[action, actorProfileId, personnel.rows, navigate],
	);

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This biocontrol action's geometry could not be loaded."
				layout="centered"
				noun="biocontrol action"
				reason="error"
			/>
		);
	}
	if (personnel.isError) {
		return (
			<RecordUnavailable
				description="This biocontrol action's personnel could not be loaded."
				layout="centered"
				noun="biocontrol action"
				reason="error"
			/>
		);
	}
	if (geometryQuery.isPending || !personnel.isReady) {
		return <EditFormSkeleton />;
	}

	return (
		<BiocontrolFormPage
			biocontrolMethods={biocontrolMethods}
			canSubmit={canSubmit}
			defaultValues={defaultsFromAction(action, personnel)}
			header={{
				title: 'Edit Biocontrol',
				description: 'Update this release’s method, amount, date, context, or location.',
				backTo: '/control-operations/biocontrol/$id',
				backParams: { id: action.id },
				backLabel: 'Back to biocontrol action',
			}}
			initialGeometry={geometryQuery.geometry}
			onSave={onSave}
			organizationId={action.organizationId}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save changes"
			units={units}
		/>
	);
}

function defaultsFromAction(
	action: BiocontrolActionRow,
	personnel: AdditionalPersonnelResult,
): BiocontrolFormValues {
	return {
		addressId: action.addressId,
		habitatId: action.habitatId,
		biocontrolMethodId: action.biocontrolMethodId,
		technicianProfileId: action.technicianProfileId ?? noTechnicianValue,
		additionalPersonnelIds: personnel.profileIds,
		biocontrolDate: action.biocontrolDate.slice(0, 10),
		amountReleased: action.amountReleased,
		releaseUnitId: action.releaseUnitId,
		metadata: asMetadataValue(action.metadata),
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
