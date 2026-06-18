import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/gis-data/addresses/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/gis-data/regions/addresses/"!</div>;
}
