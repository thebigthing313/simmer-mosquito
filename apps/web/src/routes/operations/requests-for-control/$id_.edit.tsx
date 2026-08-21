import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { RecordUnavailable } from '../../../components/record';
import { useRequestedControlActionMutations } from '../../../hooks/mutations/use-requested-control-action-mutations';
import {
	type RequestRecord,
	useRequestedControlAction,
} from '../../../hooks/queries/use-requested-control-action';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import {
	REQUESTED_CONTROL_ACTION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	NO_METHOD,
	RequestFormPage,
	type RequestFormValues,
	type RequestSaveInput,
	readRequestFields,
} from './-request-form';

export const Route = createFileRoute('/operations/requests-for-control/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		// The details and location commands are `OWN_REQUESTED_ACTION` — the author
		// or a manager. The browser cannot tell authorship apart, so the guard is the
		// read-only line and the server settles the rest.
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/operations/requests-for-control/$id',
			});
		}
	},
	component: EditRequestRoute,
});

function EditRequestRoute() {
	const { id } = Route.useParams();
	const { request, isReady } = useRequestedControlAction(id);

	if (request === undefined) {
		return isReady ? (
			<RecordUnavailable layout="centered" noun="request" reason="not-found" />
		) : (
			<EditFormSkeleton />
		);
	}
	return <EditRequestLoader request={request} />;
}

/**
 * The geometry gate.
 *
 * The synced row carries only a centroid (ADR 0009), so a request drawn as a
 * line or an area would open the form as a single point and save that back —
 * silently flattening it. The full shape is read first and the form does not
 * mount until it is in hand.
 */
function EditRequestLoader({ request }: { readonly request: RequestRecord }) {
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const actorProfileId = auth?.authenticated === true ? auth.localIdentity.profileId : null;
	const requestWrites = useRequestedControlActionMutations();

	const geometryQuery = useOwnedGeometry(
		REQUESTED_CONTROL_ACTION_GEOMETRY_SOURCE,
		request.id,
		request.updatedAt.toISOString(),
	);

	const onSave = useCallback(
		async ({ values, geometry, geometryChanged }: RequestSaveInput) => {
			// The request as it stands goes with the edit: the details and the
			// location-and-context are separate commands with separate guards, and
			// which of them this save means is decided by what actually moved.
			await requestWrites.update(
				request.id,
				{
					controlType: values.controlType,
					...readRequestFields(values),
					addressId: values.addressId,
					habitatId: values.habitatId,
				},
				{
					controlType: request.controlType,
					summary: request.summary,
					recommendedMethodId: request.recommendedMethodId,
					addressId: request.addressId,
					habitatId: request.habitatId,
				},
				// Only a redrawn shape travels: the server re-resolves `geom` from
				// whatever source it is handed, so re-sending the stored one would be a
				// write with no edit behind it.
				geometryChanged && geometry !== null ? (geometry as unknown as GeoJsonGeometry) : null,
			);
			await navigate({ to: '/operations/requests-for-control/$id', params: { id: request.id } });
		},
		[request, requestWrites, navigate],
	);

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This request's geometry could not be loaded."
				layout="centered"
				noun="request"
				reason="error"
			/>
		);
	}
	if (geometryQuery.isPending) {
		return <EditFormSkeleton />;
	}

	return (
		<RequestFormPage
			canSubmit={actorProfileId !== null}
			defaultValues={defaultsFromRequest(request)}
			errorTitle="Unable to Save Request"
			header={{
				title: 'Edit Request for Control',
				description: 'Change what is being asked for, where it is, or what it hangs off.',
				backTo: '/operations/requests-for-control/$id',
				backParams: { id: request.id },
				backLabel: 'Back to request',
			}}
			initialGeometry={geometryQuery.geometry}
			onSave={onSave}
			organizationId={request.organizationId}
			submitLabel="Save Changes"
		/>
	);
}

function defaultsFromRequest(request: RequestRecord): RequestFormValues {
	return {
		controlType: request.controlType,
		recommendedMethodId: request.recommendedMethodId ?? NO_METHOD,
		summary: request.summary ?? '',
		addressId: request.addressId,
		habitatId: request.habitatId,
	};
}

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}
