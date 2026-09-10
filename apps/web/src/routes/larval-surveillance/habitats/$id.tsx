import { createFileRoute } from '@tanstack/react-router';
import { HabitatDetail } from '../../-habitat-detail';

export const Route = createFileRoute('/larval-surveillance/habitats/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <HabitatDetail habitatId={id} />;
}
