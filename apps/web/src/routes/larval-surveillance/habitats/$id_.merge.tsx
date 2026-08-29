import { createFileRoute } from '@tanstack/react-router';
import { HabitatMerge } from '../../../components/cleanup/habitat-merge';

export const Route = createFileRoute('/larval-surveillance/habitats/$id_/merge')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <HabitatMerge habitatId={id} />;
}
