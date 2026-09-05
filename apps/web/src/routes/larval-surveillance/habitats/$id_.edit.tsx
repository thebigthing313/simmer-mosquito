import { ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { getServerUrl } from '../../../auth';
import { toDrawGeometry } from '../../../components/map/use-map-draw';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import {
	type HabitatRedraw,
	useHabitatMutations,
} from '../../../hooks/mutations/use-habitat-mutations';
import {
	type SchemaCatalogListing,
	useHabitatTypeRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { type HabitatRecord, useHabitatRecord } from '../../../hooks/queries/use-habitat-record';
import { isWriteBlocked } from '../../../lib/write-access';
import { seedHabitatGeometryCache } from '../../-habitat-geometry-cache';
import {
	type DrawGeometry,
	HabitatFormPage,
	type HabitatFormValues,
	noHabitatTypeValue,
} from './-habitat-form';

export const Route = createFileRoute('/larval-surveillance/habitats/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/larval-surveillance/habitats/$id',
			});
		}
	},
	component: EditHabitatRoute,
});

function EditHabitatRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const habitatTypes = useHabitatTypeRoster();
	const { habitat, isReady, isError } = useHabitatRecord(id);
	const organizationId =
		auth.snapshot?.authenticated === true ? (auth.snapshot.localIdentity.organizationId ?? '') : '';

	if (isError) {
		return <RecordUnavailable layout="centered" noun="habitat" reason="error" />;
	}
	if (!isReady) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-32', 'h-24']} />;
	}
	if (habitat === undefined) {
		return <RecordUnavailable layout="centered" noun="habitat" reason="not-found" />;
	}

	return (
		<EditHabitatLoader
			habitat={habitat}
			habitatTypes={habitatTypes}
			organizationId={organizationId}
		/>
	);
}

function EditHabitatLoader({
	habitat,
	habitatTypes,
	organizationId,
}: {
	readonly habitat: HabitatRecord;
	readonly habitatTypes: readonly SchemaCatalogListing[];
	readonly organizationId: string;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const mutations = useHabitatMutations();

	// Geometry is not part of the Electric shape (ADR 0009); fetch it from the
	// display endpoint. Keyed on updatedAt so re-opening the form after an edit
	// loads the latest geometry rather than a stale cached version — and holding
	// the previous geometry across that key change, since saving writes updatedAt
	// optimistically and a pending state here would unmount the form mid-save,
	// taking any error it was about to show with it (see useOwnedGeometry).
	const geometryQuery = useQuery({
		queryKey: ['habitat-geometry', habitat.id, habitat.updatedAt.toISOString()],
		queryFn: ({ signal }) => fetchHabitatGeometry(habitat.id, signal),
		placeholderData: (previous) => previous,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const initialGeometry = geometryQuery.data ?? null;

	const onSave = useCallback(
		async ({
			values,
			geometry,
			geometryChanged,
		}: {
			readonly values: HabitatFormValues;
			readonly geometry: DrawGeometry;
			readonly geometryChanged: boolean;
		}) => {
			const drawn = geometry;

			// Prime the detail's geometry cache so it shows this geometry the moment
			// we navigate, rather than refetching and flashing an empty state.
			const seedGeometry = () => seedHabitatGeometryCache(queryClient, habitat.id, drawn);
			const done = async () => {
				seedGeometry();
				await navigate({ to: '/larval-surveillance/habitats/$id', params: { id: habitat.id } });
			};

			// The flag comes from the draw state, which is the only thing that knows.
			// Deriving it here by serialising both shapes made an untouched save name
			// `updateHabitatLocation`, which is manager-and-above, and a collector
			// fixing a description was refused (#427).
			let redraw: HabitatRedraw | null = null;
			if (geometryChanged) {
				const centroid = ownedCentroidFromGeoJson(drawn);
				if (centroid === null) {
					throw new Error('Unable to determine the habitat location from the drawn geometry.');
				}
				redraw = { geometry: drawn, centroid };
			}

			// `save` sends nothing when nothing moved, so the no-op case needs no test
			// of its own here — but the navigation still has to happen either way.
			await mutations.save(
				habitat.id,
				{
					habitatName: nullableText(values.habitatName),
					description: values.description.trim(),
					addressId: values.addressId,
					habitatTypeId: values.habitatTypeId === noHabitatTypeValue ? null : values.habitatTypeId,
					metadata: values.metadata,
				},
				{
					habitatName: habitat.habitatName,
					description: habitat.description,
					addressId: habitat.addressId,
					habitatTypeId: habitat.habitatTypeId,
					metadata: habitat.metadata,
				},
				redraw,
			);
			await done();
		},
		[habitat, mutations, navigate, queryClient],
	);

	if (geometryQuery.isError) {
		return (
			<RecordUnavailable
				description="This habitat's geometry could not be loaded."
				layout="centered"
				noun="habitat"
				reason="error"
			/>
		);
	}
	if (geometryQuery.isPending) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-32', 'h-24']} />;
	}

	return (
		<HabitatFormPage
			mode="edit"
			organizationId={organizationId}
			canSubmit={mutations.canWrite}
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

function defaultsFromHabitat(habitat: HabitatRecord): HabitatFormValues {
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
	const response = await sessionFetch(url, { credentials: 'include', signal });
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

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
