import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/public-engagement/contacts/$id/edit')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/public-engagement/contacts/$id/edit"!</div>;
}
