import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/adult-surveillance/traps/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/adult-surveillance/traps/"!</div>;
}
