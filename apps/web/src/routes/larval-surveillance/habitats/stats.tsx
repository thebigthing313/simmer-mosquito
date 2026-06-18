import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/habitats/stats')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/habitats/stats"!</div>;
}
