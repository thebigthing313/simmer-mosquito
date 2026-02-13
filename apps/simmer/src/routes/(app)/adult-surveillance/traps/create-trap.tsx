import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/adult-surveillance/traps/create-trap')({
	beforeLoad: () => {
		return {
			mainOutlet: {
				header: 'Create Trap',
				description: 'Add a new surveillance trap',
			},
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/(app)/adult-surveillance/create-trap"!</div>;
}
