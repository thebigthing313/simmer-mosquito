import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/inspections/create')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/inspections/create"!</div>;
}
