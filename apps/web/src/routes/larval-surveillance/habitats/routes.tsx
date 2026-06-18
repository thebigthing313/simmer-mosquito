import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/habitats/routes')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/habitats/routes"!</div>;
}
