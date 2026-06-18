import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/samples/stats')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/samples/stats"!</div>;
}
