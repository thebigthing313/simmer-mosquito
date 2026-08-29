import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { RecordUnavailable } from '../../../components/record';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useBiocontrolActionMutations } from '../../../hooks/mutations/use-biocontrol-action-mutations';
import type { BiocontrolAction } from '../../../hooks/queries/control-action-view';
import {
	type AdditionalPersonnelResult,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import { useBiocontrolAction } from '../../../hooks/queries/use-biocontrol-action';
import {
	type SchemaCatalogListing,
	useBiocontrolMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { type UnitLabel, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { BIOCONTROL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
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
	const methods = useBiocontrolMethodRoster();
	const { all: units } = useUnitLabels();
	const profiles = useProfileRoster();

	const { action, isReady, isError } = useBiocontrolAction(id, { gcTime: biocontrolGcTimeMs });

	if (isError) {
		return <RecordUnavailable layout="centered" noun="biocontrol action" reason="error" />;
	}
	if (!isReady) {
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
			biocontrolMethods={methods}
			canSubmit={organization !== null && actorProfileId !== null}
			organizationId={organization?.id ?? ''}
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
	canSubmit,
	organizationId,
}: {
	readonly action: BiocontrolAction;
	readonly biocontrolMethods: readonly SchemaCatalogListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly canSubmit: boolean;
	readonly organizationId: string;
}) {
	const navigate = useNavigate();
	const { update } = useBiocontrolActionMutations();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(
		BIOCONTROL_GEOMETRY_SOURCE,
		action.id,
		action.updatedAt.toISOString(),
	);
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'biocontrolAction', id: action.id });
	const { setPersonnel } = useAdditionalPersonnelMutations();

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

			// The shape and the address/habitat are independent: only state a location
			// when the user actually redrew it. Absent means "leave it", which is not
			// the same request as re-sending the shape it already has.
			const redrawn =
				geometryChanged && geometry !== null ? (geometry as unknown as GeoJsonGeometry) : null;
			const centroid = redrawn === null ? null : ownedCentroidFromGeoJson(redrawn);

			// Which commands this save means is worked out by the hook, from what
			// actually moved — the field details and the placement are different
			// builders, and naming one with nothing to read is refused.
			await update(action, {
				values: {
					methodId: values.biocontrolMethodId,
					technicianProfileId:
						values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
					actionDate: values.biocontrolDate,
					addressId: values.addressId,
					habitatId: values.habitatId,
					amountReleased: values.amountReleased,
					unitId: values.releaseUnitId,
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
			await setPersonnel({
				target: { type: 'biocontrolAction', id: action.id },
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({ to: '/control-operations/biocontrol/$id', params: { id: action.id } });
		},
		[action, personnel.rows, navigate, update, setPersonnel],
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

function defaultsFromAction(
	action: BiocontrolAction,
	personnel: AdditionalPersonnelResult,
): BiocontrolFormValues {
	return {
		addressId: action.addressId,
		habitatId: action.habitatId,
		biocontrolMethodId: action.methodId,
		technicianProfileId: action.technicianProfileId ?? noTechnicianValue,
		additionalPersonnelIds: personnel.profileIds,
		biocontrolDate: action.actionDate.slice(0, 10),
		amountReleased: action.amountReleased,
		releaseUnitId: action.unitId,
		metadata: asMetadataValue(action.metadata),
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
