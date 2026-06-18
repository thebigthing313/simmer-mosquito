import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/missions/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/missions/"!</div>;
}
