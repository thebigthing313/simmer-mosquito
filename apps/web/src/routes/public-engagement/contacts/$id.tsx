import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/public-engagement/contacts/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/public-engagement/contacts/$id"!</div>;
}
