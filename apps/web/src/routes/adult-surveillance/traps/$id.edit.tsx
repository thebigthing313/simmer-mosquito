import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/adult-surveillance/traps/$id/edit')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/adult-surveillance/traps/$id/edit"!</div>;
}
