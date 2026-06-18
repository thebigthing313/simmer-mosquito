import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/adult-surveillance/collections/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/adult-surveillance/collections/"!</div>;
}
