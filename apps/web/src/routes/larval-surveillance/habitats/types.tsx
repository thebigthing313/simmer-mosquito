import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/habitats/types')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/habitats/types"!</div>;
}
