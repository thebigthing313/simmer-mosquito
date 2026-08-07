import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import {
	REQUESTED_CONTROL_ACTION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	type RequestView,
	updateRequestedControlAction,
	useRequestedControlAction,
} from '../-operations-data';
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

	if (request === null) {
		return isReady ? (
			<EditUnavailable description="This request may have been deleted, or the link is out of date." />
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
function EditRequestLoader({ request }: { readonly request: RequestView }) {
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const actorProfileId = auth?.authenticated === true ? auth.localIdentity.profileId : null;

	const geometryQuery = useOwnedGeometry(
		REQUESTED_CONTROL_ACTION_GEOMETRY_SOURCE,
		request.id,
		request.updatedAt,
	);

	const onSave = useCallback(
		async ({ values, geometry, geometryChanged }: RequestSaveInput) => {
			await updateRequestedControlAction({
				requestId: request.id,
				actorProfileId,
				controlType: values.controlType,
				...readRequestFields(values),
				addressId: values.addressId,
				habitatId: values.habitatId,
				// Only a redrawn shape travels: the server re-resolves `geom` from
				// whatever source it is handed, so re-sending the stored one would be a
				// write with no edit behind it.
				geometry:
					geometryChanged && geometry !== null ? (geometry as unknown as GeoJsonGeometry) : null,
			});
			await navigate({ to: '/operations/requests-for-control/$id', params: { id: request.id } });
		},
		[request.id, actorProfileId, navigate],
	);

	if (geometryQuery.isError) {
		return <EditUnavailable description="This request's geometry could not be loaded." />;
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

function defaultsFromRequest(request: RequestView): RequestFormValues {
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

function EditUnavailable({ description }: { readonly description: string }) {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-8">
			<Empty className="max-w-md border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>Request Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
