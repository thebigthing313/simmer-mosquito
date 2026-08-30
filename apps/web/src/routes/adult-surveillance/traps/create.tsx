import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useTrapMutations } from '../../../hooks/mutations/use-trap-mutations';
import {
	useCollectionLureRoster,
	useCollectionMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { TRAP_SAVE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { isBelowRole } from '../../../lib/write-access';
import {
	type DrawGeometry,
	defaultTrapFormValues,
	TrapFormPage,
	type TrapFormValues,
	trapFieldsFrom,
} from './-trap-form';

export const Route = createFileRoute('/adult-surveillance/traps/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => mapPointSearchSchema.parse(search),
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/adult-surveillance/traps' });
		}
	},
	component: CreateTrapRoute,
});

function CreateTrapRoute() {
	const { auth } = Route.useRouteContext();
	const initialGeometry = pointFromSearch(Route.useSearch());
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const methods = useCollectionMethodRoster();
	const lures = useCollectionLureRoster();
	const mutations = useTrapMutations();
	const { run, dialog } = useAcknowledgedWrite({ askable: TRAP_SAVE_REFUSALS, ask: true });

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: TrapFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			if (geometry === null) {
				throw new Error('Place the trap point on the map.');
			}

			// The point is the trap's authoritative geometry; the address (if any) is
			// reference only. The server recomputes geom from the location source; this
			// centroid seeds the optimistic row so the map/coordinates show immediately.
			const shape = geometry as unknown as GeoJsonGeometry;
			const centroid = ownedCentroidFromGeoJson(shape);
			if (centroid === null) {
				throw new Error('Unable to determine the trap location.');
			}

			// The code question goes out unanswered and comes back as a refusal only
			// if another trap already carries the code.
			//
			// The navigation is *inside* the callback on purpose: `run` resolves on a
			// refusal as well as on a success, because a refusal is a question rather
			// than a failure. Leaving here on the way past would abandon the page
			// before the question could be asked, and read as a save that worked.
			await run(async (acknowledgements) => {
				const trapId = await mutations.create(
					trapFieldsFrom(values),
					shape,
					centroid,
					acknowledgements,
				);
				await navigate({ to: '/adult-surveillance/traps/$id', params: { id: trapId } });
			});
		},
		[mutations, navigate, run],
	);

	return (
		<>
			<TrapFormPage
				canSubmit={mutations.canWrite}
				collectionLures={lures}
				collectionMethods={methods}
				defaultValues={defaultTrapFormValues()}
				header={{
					title: 'Add Trap',
					description:
						'Place the trap point, optionally reference an address, and set its method and lure.',
					backTo: '/adult-surveillance/traps',
					backLabel: 'Traps',
				}}
				initialGeometry={initialGeometry}
				onSave={onSave}
				organizationId={organization?.id ?? ''}
				submitLabel="Add Trap"
			/>
			{dialog}
		</>
	);
}
