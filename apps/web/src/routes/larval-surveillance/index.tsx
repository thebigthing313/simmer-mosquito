import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/"!</div>;
}
