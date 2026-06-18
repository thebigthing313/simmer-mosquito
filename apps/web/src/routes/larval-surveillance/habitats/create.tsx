import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/habitats/create')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/habitats/create"!</div>;
}
