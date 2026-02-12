import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/adult-surveillance/traps/')({
	beforeLoad: () => {
		return {
			mainOutlet: {
				header: 'Manage Traps',
				description: 'View and manage all catalogued traps.',
			},
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/(app)/adult-surveillance/traps/"!</div>;
}
