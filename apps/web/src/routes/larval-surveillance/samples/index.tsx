import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/larval-surveillance/samples/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/larval-surveillance/samples/"!</div>;
}
