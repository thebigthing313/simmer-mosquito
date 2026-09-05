import { ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useHabitatMutations } from '../../../hooks/mutations/use-habitat-mutations';
import { useHabitatTypeRoster } from '../../../hooks/queries/use-catalog-rosters';
import { isBelowRole } from '../../../lib/write-access';
import { seedHabitatGeometryCache } from '../../-habitat-geometry-cache';
import {
	type DrawGeometry,
	defaultHabitatFormValues,
	HabitatFormPage,
	type HabitatFormValues,
	noHabitatTypeValue,
} from './-habitat-form';

export const Route = createFileRoute('/larval-surveillance/habitats/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => mapPointSearchSchema.parse(search),
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/larval-surveillance/habitats' });
		}
	},
	component: CreateHabitatRoute,
});

function CreateHabitatRoute() {
	const { auth } = Route.useRouteContext();
	const initialGeometry = pointFromSearch(Route.useSearch());
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const habitatTypes = useHabitatTypeRoster();
	const mutations = useHabitatMutations();
	const organizationId =
		auth.snapshot?.authenticated === true ? (auth.snapshot.localIdentity.organizationId ?? '') : '';

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: HabitatFormValues;
			readonly geometry: DrawGeometry;
		}) => {
			const drawn = geometry;
			const centroid = ownedCentroidFromGeoJson(drawn);
			if (centroid === null) {
				throw new Error('Unable to determine the habitat location from the drawn geometry.');
			}

			const habitatId = await mutations.create(
				{
					habitatName: nullableText(values.habitatName),
					description: values.description.trim(),
					addressId: values.addressId,
					habitatTypeId: values.habitatTypeId === noHabitatTypeValue ? null : values.habitatTypeId,
					metadata: values.metadata,
				},
				drawn,
				centroid,
			);

			// Prime the detail's geometry cache so it renders the new shape on arrival
			// instead of fetching (and briefly showing an empty state) from scratch.
			seedHabitatGeometryCache(queryClient, habitatId, drawn);
			await navigate({ to: '/larval-surveillance/habitats/$id', params: { id: habitatId } });
		},
		[mutations, navigate, queryClient],
	);

	return (
		<HabitatFormPage
			mode="create"
			organizationId={organizationId}
			canSubmit={mutations.canWrite}
			habitatTypes={habitatTypes}
			defaultValues={defaultHabitatFormValues()}
			initialGeometry={initialGeometry}
			header={{
				title: 'Create Habitat',
				description: 'Add a mapped larval habitat with the core field details crews need.',
				backTo: '/larval-surveillance/habitats',
				backLabel: 'Habitats',
			}}
			submitLabel="Create Habitat"
			onSave={onSave}
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
