import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { HabitatRow, HabitatTypeRow } from '@simmer-mosquito/sync';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { getServerUrl } from '../../../auth';
import type { MetadataValue } from '../../../forms/field-components/metadata-field';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { seedHabitatGeometryCache } from '../../-habitat-detail';
import {
	type DrawGeometry,
	HabitatFormPage,
	type HabitatFormValues,
	noHabitatTypeValue,
} from './-habitat-form';

export const Route = createFileRoute('/larval-surveillance/habitats/$id_/edit')({
	component: EditHabitatRoute,
});

function EditHabitatRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);

	// habitats is an on-demand collection, so this reads live status via
	// useLiveQuery (not the suspense variant, which can hang after a nav unmount).
	const habitatResult = useLiveQuery(
		(query) =>
			query
				.from({ habitat: webCollections.habitats })
				.where(({ habitat }) => eq(habitat.id, id))
				.findOne(),
		[id],
	);
	const habitat = habitatResult.data;

	if (habitatResult.isError) {
		return <EditUnavailable description="This habitat could not be loaded." />;
	}
	if (!habitatResult.isReady) {
		return <EditFormSkeleton />;
	}
	if (habitat === undefined) {
		return (
			<EditUnavailable description="This habitat could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditHabitatLoader
			actorProfileId={actorProfileId}
			habitat={habitat}
			habitatTypes={habitatTypes}
			organizationId={organization?.id ?? ''}
			canSubmit={organization !== null && actorProfileId !== null}
		/>
	);
}

function EditHabitatLoader({
	habitat,
	habitatTypes,
	organizationId,
	actorProfileId,
	canSubmit,
}: {
	readonly habitat: HabitatRow;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Geometry is not part of the Electric shape (ADR 0009); fetch it from the
	// display endpoint. Keyed on updatedAt so re-opening the form after an edit
	// loads the latest geometry rather than a stale cached version.
	const geometryQuery = useQuery({
		queryKey: ['habitat-geometry', habitat.id, habitat.updatedAt],
		queryFn: ({ signal }) => fetchHabitatGeometry(habitat.id, signal),
		staleTime: Number.POSITIVE_INFINITY,
	});

	const initialGeometry = geometryQuery.data ?? null;

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: HabitatFormValues;
			readonly geometry: DrawGeometry;
		}) => {
			const nextName = nullableText(values.habitatName);
			const nextTypeId = values.habitatTypeId === noHabitatTypeValue ? null : values.habitatTypeId;
			const nextDescription = values.description.trim();
			const geometryChanged = JSON.stringify(geometry) !== JSON.stringify(initialGeometry);
			const detailsChanged =
				nextName !== habitat.habitatName ||
				nextTypeId !== habitat.habitatTypeId ||
				values.addressId !== habitat.addressId ||
				nextDescription !== habitat.description ||
				JSON.stringify(values.metadata ?? null) !== JSON.stringify(habitat.metadata ?? null);

			// Prime the detail's geometry cache so it shows this geometry the moment
			// we navigate, rather than refetching and flashing an empty state.
			const seedGeometry = () =>
				seedHabitatGeometryCache(queryClient, habitat.id, geometry as unknown as GeoJsonGeometry);

			// Nothing actually changed — skip the round trip (the server rejects an
			// empty habitat update) and return to the record.
			if (!geometryChanged && !detailsChanged) {
				seedGeometry();
				await navigate({ to: '/larval-surveillance/habitats/$id', params: { id: habitat.id } });
				return;
			}

			const now = new Date().toISOString();
			// Inlined so TanStack DB infers the mutable draft type; a standalone
			// `(draft: HabitatRow)` annotation would re-impose the row's readonly props.
			const applyEdits = (draft: HabitatRow) => {
				const writable = draft as { -readonly [K in keyof HabitatRow]: HabitatRow[K] };
				writable.habitatName = nextName;
				writable.habitatTypeId = nextTypeId;
				writable.addressId = values.addressId;
				writable.description = nextDescription;
				writable.metadata = values.metadata;
				if (actorProfileId !== null) {
					writable.updatedByProfileId = actorProfileId;
				}
				writable.updatedAt = now;
			};

			const transaction = geometryChanged
				? webCollections.habitats.update(
						habitat.id,
						{ metadata: { locationSource: { kind: 'geometry', geometry } } },
						applyEdits,
					)
				: webCollections.habitats.update(habitat.id, applyEdits);
			await transaction.isPersisted.promise;
			seedGeometry();
			await navigate({ to: '/larval-surveillance/habitats/$id', params: { id: habitat.id } });
		},
		[habitat, initialGeometry, actorProfileId, navigate, queryClient],
	);

	if (geometryQuery.isError) {
		return <EditUnavailable description="This habitat's geometry could not be loaded." />;
	}
	if (geometryQuery.isPending) {
		return <EditFormSkeleton />;
	}

	return (
		<HabitatFormPage
			mode="edit"
			organizationId={organizationId}
			actorProfileId={actorProfileId}
			canSubmit={canSubmit}
			habitatTypes={habitatTypes}
			defaultValues={defaultsFromHabitat(habitat)}
			initialGeometry={initialGeometry}
			header={{
				title: 'Edit Habitat',
				description: 'Update the field details or redraw the mapped geometry for this habitat.',
				backTo: '/larval-surveillance/habitats/$id',
				backParams: { id: habitat.id },
				backLabel: 'Back to habitat',
			}}
			submitLabel="Save Changes"
			onSave={onSave}
		/>
	);
}

function defaultsFromHabitat(habitat: HabitatRow): HabitatFormValues {
	return {
		habitatName: habitat.habitatName ?? '',
		addressId: habitat.addressId,
		habitatTypeId: habitat.habitatTypeId ?? noHabitatTypeValue,
		description: habitat.description,
		metadata: (habitat.metadata ?? null) as MetadataValue,
	};
}

async function fetchHabitatGeometry(
	habitatId: string,
	signal: AbortSignal,
): Promise<DrawGeometry | null> {
	const url = new URL(`/map/habitats/${habitatId}`, getServerUrl());
	const response = await fetch(url, { credentials: 'include', signal });
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Habitat geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly habitat?: { readonly geojson?: unknown };
	};
	return toDrawGeometry(body.habitat?.geojson ?? null);
}

// The draw flow owns single Point/LineString/Polygon geometries. Anything else
// (legacy multi-geometries) can't be re-drawn vertex-by-vertex here, so it seeds
// as "no geometry" — details are still editable and a redraw replaces it.
function toDrawGeometry(geojson: unknown): DrawGeometry | null {
	if (geojson === null || typeof geojson !== 'object') {
		return null;
	}
	const candidate = geojson as { readonly type?: unknown; readonly coordinates?: unknown };
	// Require coordinates to be present and non-empty: a type-only geometry would
	// crash the summary/preview, so treat it as "no geometry" (redraw to set one).
	if (!Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
		return null;
	}
	if (
		candidate.type === 'Point' ||
		candidate.type === 'LineString' ||
		candidate.type === 'Polygon'
	) {
		return geojson as DrawGeometry;
	}
	return null;
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
				<Skeleton className="h-32 w-full" />
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
					<EmptyTitle>Habitat Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
