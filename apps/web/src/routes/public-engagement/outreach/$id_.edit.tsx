import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useOutreachActionMutations } from '../../../hooks/mutations/use-outreach-action-mutations';
import type { OutreachAction } from '../../../hooks/queries/outreach-view';
import {
	type AdditionalPersonnelResult,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import {
	type SchemaCatalogListing,
	useOutreachMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { useOutreachAction } from '../../../hooks/queries/use-outreach-action';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { OUTREACH_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	type DrawGeometry,
	noTechnicianValue,
	OutreachFormPage,
	type OutreachFormValues,
} from './-outreach-form';

const outreachGcTimeMs = 30_000;

export const Route = createFileRoute('/public-engagement/outreach/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/public-engagement/outreach/$id',
			});
		}
	},
	component: EditOutreachActionRoute,
});

function EditOutreachActionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useOutreachMethodRoster();
	const profiles = useProfileRoster();

	const { action, isReady, isError } = useOutreachAction(id, { gcTime: outreachGcTimeMs });

	if (isError) {
		return <RecordUnavailable layout="centered" noun="outreach action" reason="error" />;
	}
	if (!isReady) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />;
	}
	if (action === undefined) {
		return <RecordUnavailable layout="centered" noun="outreach action" reason="not-found" />;
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditOutreachActionLoader
			action={action}
			canSubmit={organization !== null && actorProfileId !== null}
			organizationId={organization?.id ?? ''}
			outreachMethods={methods}
			profiles={profiles}
		/>
	);
}

function EditOutreachActionLoader({
	action,
	outreachMethods,
	profiles,
	canSubmit,
	organizationId,
}: {
	readonly action: OutreachAction;
	readonly outreachMethods: readonly SchemaCatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly canSubmit: boolean;
	readonly organizationId: string;
}) {
	const navigate = useNavigate();
	const { update } = useOutreachActionMutations();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(
		OUTREACH_GEOMETRY_SOURCE,
		action.id,
		action.updatedAt.toISOString(),
	);
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'outreachAction', id: action.id });
	const { setPersonnel } = useAdditionalPersonnelMutations();

	const onSave = useCallback(
		async ({
			values,
			geometry,
			geometryChanged,
		}: {
			readonly values: OutreachFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			if (values.reach === null) {
				throw new Error('Enter how many people were reached.');
			}
			const trimmedDescription = values.reachDescription.trim();

			// The shape and the address are independent: only state a location when the
			// user actually redrew it. Absent means "leave it", which is not the same
			// request as re-sending the shape it already has.
			const redrawn =
				geometryChanged && geometry !== null ? (geometry as unknown as GeoJsonGeometry) : null;
			const centroid = redrawn === null ? null : ownedCentroidFromGeoJson(redrawn);

			// Which commands this save means is worked out by the hook, from what
			// actually moved — the field details and the placement are different
			// builders, and naming one with nothing to read is refused.
			await update(action, {
				values: {
					methodId: values.outreachMethodId,
					technicianProfileId:
						values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
					actionDate: values.outreachDate,
					addressId: values.addressId,
					reach: values.reach,
					reachDescription: trimmedDescription === '' ? null : trimmedDescription,
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
				target: { type: 'outreachAction', id: action.id },
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({ to: '/public-engagement/outreach/$id', params: { id: action.id } });
		},
		[action, personnel.rows, navigate, update, setPersonnel],
	);

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This outreach action's geometry could not be loaded."
				layout="centered"
				noun="outreach action"
				reason="error"
			/>
		);
	}
	if (personnel.isError) {
		return (
			<RecordUnavailable
				description="This outreach action's personnel could not be loaded."
				layout="centered"
				noun="outreach action"
				reason="error"
			/>
		);
	}
	if (geometryQuery.isPending || !personnel.isReady) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />;
	}

	return (
		<OutreachFormPage
			canSubmit={canSubmit}
			mode="edit"
			defaultValues={defaultsFromAction(action, personnel)}
			header={{
				title: 'Edit Outreach',
				description: 'Update this action’s method, reach, date, or location.',
				backTo: '/public-engagement/outreach/$id',
				backParams: { id: action.id },
				backLabel: 'Back to outreach action',
			}}
			initialGeometry={geometryQuery.geometry}
			onSave={onSave}
			organizationId={organizationId}
			outreachMethods={outreachMethods}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save changes"
		/>
	);
}

function defaultsFromAction(
	action: OutreachAction,
	personnel: AdditionalPersonnelResult,
): OutreachFormValues {
	return {
		addressId: action.addressId,
		outreachMethodId: action.methodId,
		technicianProfileId: action.technicianProfileId ?? noTechnicianValue,
		additionalPersonnelIds: personnel.profileIds,
		outreachDate: action.outreachDate.slice(0, 10),
		reach: action.reach,
		reachDescription: action.reachDescription ?? '',
		metadata: asMetadataValue(action.metadata),
		// Create-only field; the detail page's thread is where an edit adds a note.
		comment: '',
	};
}
