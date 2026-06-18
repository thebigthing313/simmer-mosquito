import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/gis-data/addresses/create')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/gis-data/addresses/create"!</div>;
}
