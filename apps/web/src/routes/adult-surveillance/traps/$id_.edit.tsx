import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { RecordUnavailable } from '../../../components/record';
import { useTrapMutations } from '../../../hooks/mutations/use-trap-mutations';
import {
	type CatalogListing,
	type SchemaCatalogListing,
	useCollectionLureRoster,
	useCollectionMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import { type TrapRecord, useTrapRecord } from '../../../hooks/queries/use-trap-record';
import { isBelowRole } from '../../../lib/write-access';
import {
	type DrawGeometry,
	TrapFormPage,
	type TrapFormValues,
	trapFieldsFrom,
	trapFormValuesFrom,
} from './-trap-form';

export const Route = createFileRoute('/adult-surveillance/traps/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/adult-surveillance/traps/$id',
			});
		}
	},
	component: EditTrapRoute,
});

function EditTrapRoute() {
	const { id } = Route.useParams();
	const methods = useCollectionMethodRoster();
	const lures = useCollectionLureRoster();
	const { trap, isReady, isError } = useTrapRecord(id);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="trap" reason="error" />;
	}
	if (!isReady) {
		return <EditFormSkeleton />;
	}
	if (trap === undefined) {
		return <RecordUnavailable layout="centered" noun="trap" reason="not-found" />;
	}

	return <EditTrapLoader collectionLures={lures} collectionMethods={methods} trap={trap} />;
}

function EditTrapLoader({
	trap,
	collectionMethods,
	collectionLures,
}: {
	readonly trap: TrapRecord;
	readonly collectionMethods: readonly SchemaCatalogListing[];
	readonly collectionLures: readonly CatalogListing[];
}) {
	const navigate = useNavigate();
	const mutations = useTrapMutations();

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
			// The point and the address are independent: only state a location when the
			// user actually refined the point. Naming the configuration command with the
			// point the trap already has is a write with no edit behind it, and the
			// centroid it would reseed is the one already on screen.
			const shape =
				geometryChanged && geometry !== null ? (geometry as unknown as GeoJsonGeometry) : null;
			const centroid = shape === null ? null : ownedCentroidFromGeoJson(shape);
			if (shape !== null && centroid === null) {
				throw new Error('Unable to determine the trap location.');
			}

			await mutations.save(
				trap.id,
				trapFieldsFrom(values),
				trapFieldsFrom(trapFormValuesFrom(trap)),
				shape === null || centroid === null ? null : { geometry: shape, centroid },
			);
			await navigate({ to: '/adult-surveillance/traps/$id', params: { id: trap.id } });
		},
		[trap, mutations, navigate],
	);

	return (
		<TrapFormPage
			canSubmit={mutations.canWrite}
			collectionLures={collectionLures}
			collectionMethods={collectionMethods}
			defaultValues={trapFormValuesFrom(trap)}
			header={{
				title: 'Edit Trap',
				description: 'Update this trap’s details, method, lure, or location.',
				backTo: '/adult-surveillance/traps/$id',
				backParams: { id: trap.id },
				backLabel: 'Back to trap',
			}}
			initialGeometry={{ type: 'Point', coordinates: [trap.longitude, trap.latitude] }}
			onSave={onSave}
			organizationId={trap.organizationId}
			requireLocation={false}
			submitLabel="Save Changes"
		/>
	);
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
