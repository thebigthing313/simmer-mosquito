import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/inspections/stats')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/inspections/stats"!</div>;
}
