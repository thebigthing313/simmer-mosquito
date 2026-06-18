import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/gis-data/weather/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/gis-data/weather/"!</div>;
}
