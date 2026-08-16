import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { OutreachActionRow } from '@simmer-mosquito/sync';
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
	useOutreachMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { OUTREACH_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
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

	// outreachActions is on-demand; status-gated useLiveQuery (not suspense) avoids
	// the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: outreachGcTimeMs,
			query: (query) =>
				query
					.from({ action: webCollections.outreachActions })
					.where(({ action }) => eq(action.id, id))
					.findOne(),
		},
		[id],
	);
	const action = result.data as OutreachActionRow | undefined;

	if (result.isError) {
		return <RecordUnavailable layout="centered" noun="outreach action" reason="error" />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (action === undefined) {
		return <RecordUnavailable layout="centered" noun="outreach action" reason="not-found" />;
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditOutreachActionLoader
			action={action}
			actorProfileId={actorProfileId}
			canSubmit={organization !== null && actorProfileId !== null}
			outreachMethods={methods}
			profiles={profiles}
		/>
	);
}

function EditOutreachActionLoader({
	action,
	outreachMethods,
	profiles,
	actorProfileId,
	canSubmit,
}: {
	readonly action: OutreachActionRow;
	readonly outreachMethods: readonly SchemaCatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();

	// The synced row carries only the centroid, so the full shape (which may be a
	// line or polygon) is read from the display endpoint before the form opens.
	const geometryQuery = useOwnedGeometry(OUTREACH_GEOMETRY_SOURCE, action.id, action.updatedAt);
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'outreachAction', id: action.id });

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
			const nextReach = values.reach;
			const trimmedDescription = values.reachDescription.trim();
			const nextTechnicianId =
				values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId;

			// The geometry and the address are independent: only send a location source
			// (and reseed the optimistic centroid) when the user actually redrew the
			// shape; the address is a plain field change.
			const refinedGeometry = geometryChanged && geometry !== null;
			const locationSource = refinedGeometry
				? ({ kind: 'geometry', geometry: geometry as unknown as GeoJsonGeometry } as const)
				: undefined;
			const nextCentroid = refinedGeometry
				? ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry)
				: null;

			const now = new Date().toISOString();
			// Inlined so TanStack DB infers the mutable draft type.
			const applyEdits = (draft: OutreachActionRow) => {
				const writable = draft as {
					-readonly [K in keyof OutreachActionRow]: OutreachActionRow[K];
				};
				writable.outreachMethodId = values.outreachMethodId;
				writable.technicianProfileId = nextTechnicianId;
				writable.outreachDate = values.outreachDate;
				writable.reach = nextReach;
				writable.reachDescription = trimmedDescription === '' ? null : trimmedDescription;
				writable.addressId = values.addressId;
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
					? webCollections.outreachActions.update(action.id, applyEdits)
					: webCollections.outreachActions.update(
							action.id,
							{ metadata: { locationSource } },
							applyEdits,
						);
			await settleWrite(transaction);
			await saveAdditionalPersonnel({
				target: { type: 'outreachAction', id: action.id },
				organizationId: action.organizationId,
				actorProfileId,
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({ to: '/public-engagement/outreach/$id', params: { id: action.id } });
		},
		[action, actorProfileId, personnel.rows, navigate],
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
		return <EditFormSkeleton />;
	}

	return (
		<OutreachFormPage
			canSubmit={canSubmit}
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
			organizationId={action.organizationId}
			outreachMethods={outreachMethods}
			profiles={profiles}
			requireLocation={false}
			submitLabel="Save changes"
		/>
	);
}

function defaultsFromAction(
	action: OutreachActionRow,
	personnel: AdditionalPersonnelResult,
): OutreachFormValues {
	return {
		addressId: action.addressId,
		outreachMethodId: action.outreachMethodId,
		technicianProfileId: action.technicianProfileId ?? noTechnicianValue,
		additionalPersonnelIds: personnel.profileIds,
		outreachDate: action.outreachDate.slice(0, 10),
		reach: action.reach,
		reachDescription: action.reachDescription ?? '',
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
