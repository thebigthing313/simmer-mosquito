import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/public-engagement/service-requests/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/public-engagement/service-requests/"!</div>;
}
