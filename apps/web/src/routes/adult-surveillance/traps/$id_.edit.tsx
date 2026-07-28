import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { CollectionLureRow, CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
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
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { type DrawGeometry, noLureValue, TrapFormPage, type TrapFormValues } from './-trap-form';

export const Route = createFileRoute('/adult-surveillance/traps/$id_/edit')({
	component: EditTrapRoute,
});

function EditTrapRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);

	// traps is an eager collection, so this resolves without a fetch.
	const trapResult = useLiveQuery(
		(query) =>
			query
				.from({ trap: webCollections.traps })
				.where(({ trap }) => eq(trap.id, id))
				.findOne(),
		[id],
	);
	const trap = trapResult.data as TrapRow | undefined;

	if (trapResult.isError) {
		return <EditUnavailable description="This trap could not be loaded." />;
	}
	if (!trapResult.isReady) {
		return <EditFormSkeleton />;
	}
	if (trap === undefined) {
		return (
			<EditUnavailable description="This trap could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditTrapLoader
			actorProfileId={actorProfileId}
			canSubmit={organization !== null && actorProfileId !== null}
			collectionLures={lures}
			collectionMethods={methods}
			trap={trap}
		/>
	);
}

function EditTrapLoader({
	trap,
	collectionMethods,
	collectionLures,
	actorProfileId,
	canSubmit,
}: {
	readonly trap: TrapRow;
	readonly collectionMethods: readonly CollectionMethodRow[];
	readonly collectionLures: readonly CollectionLureRow[];
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
			readonly values: TrapFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			const nextName = nullableText(values.trapName);
			const nextCode = nullableText(values.trapCode);
			const nextDescription = nullableText(values.description);
			const nextMethodId = values.collectionMethodId;
			const nextLureId = values.collectionLureId === noLureValue ? null : values.collectionLureId;

			// The point (geometry) and the address are independent now: only send a
			// location source (and reseed the optimistic centroid) when the user
			// actually refined the point; the address is a plain field change.
			const refinedPoint = geometryChanged && geometry !== null;
			const locationSource = refinedPoint
				? ({ kind: 'geometry', geometry: geometry as unknown as GeoJsonGeometry } as const)
				: undefined;
			const nextCentroid = refinedPoint
				? ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry)
				: null;

			const now = new Date().toISOString();
			// Inlined so TanStack DB infers the mutable draft type.
			const applyEdits = (draft: TrapRow) => {
				const writable = draft as { -readonly [K in keyof TrapRow]: TrapRow[K] };
				writable.trapName = nextName;
				writable.trapCode = nextCode;
				writable.description = nextDescription;
				writable.collectionMethodId = nextMethodId;
				writable.collectionLureId = nextLureId;
				writable.addressId = values.addressId;
				writable.isActive = values.isActive;
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
					? webCollections.traps.update(trap.id, applyEdits)
					: webCollections.traps.update(trap.id, { metadata: { locationSource } }, applyEdits);
			await settleWrite(transaction);
			await navigate({ to: '/adult-surveillance/traps/$id', params: { id: trap.id } });
		},
		[trap, actorProfileId, navigate],
	);

	return (
		<TrapFormPage
			canSubmit={canSubmit}
			collectionLures={collectionLures}
			collectionMethods={collectionMethods}
			defaultValues={defaultsFromTrap(trap)}
			header={{
				title: 'Edit Trap',
				description: 'Update this trap’s details, method, lure, or location.',
				backTo: '/adult-surveillance/traps/$id',
				backParams: { id: trap.id },
				backLabel: 'Back to trap',
			}}
			initialGeometry={pointFromTrap(trap)}
			initialPreviewGeometry={pointFromTrap(trap) as unknown as GeoJsonGeometry}
			onSave={onSave}
			organizationId={trap.organizationId}
			requireLocation={false}
			submitLabel="Save Changes"
		/>
	);
}

function pointFromTrap(trap: TrapRow): DrawGeometry {
	return { type: 'Point', coordinates: [trap.lng, trap.lat] };
}

function defaultsFromTrap(trap: TrapRow): TrapFormValues {
	return {
		addressId: trap.addressId,
		collectionMethodId: trap.collectionMethodId,
		collectionLureId: trap.collectionLureId ?? noLureValue,
		trapName: trap.trapName ?? '',
		trapCode: trap.trapCode ?? '',
		description: trap.description ?? '',
		isActive: trap.isActive,
	};
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
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
					<EmptyTitle>Trap Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
