import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/assignments/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/assignments/"!</div>;
}
