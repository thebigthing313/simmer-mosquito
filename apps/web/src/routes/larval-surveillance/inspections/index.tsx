import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/inspections/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/inspections/"!</div>;
}
