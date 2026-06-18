import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/gis-data/regions/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/gis-data/regions/"!</div>;
}
