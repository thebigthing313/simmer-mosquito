import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/adult-surveillance/collections/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/(app)/adult-surveillance/collections/"!</div>;
}
