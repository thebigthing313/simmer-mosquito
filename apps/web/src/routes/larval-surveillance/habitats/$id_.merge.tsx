import { createFileRoute, redirect } from '@tanstack/react-router';
import { HabitatMerge } from '../../../components/cleanup/habitat-merge';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/larval-surveillance/habitats/$id_/merge')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/larval-surveillance/habitats/$id/merge')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/larval-surveillance/habitats/$id',
			});
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <HabitatMerge habitatId={id} />;
}
