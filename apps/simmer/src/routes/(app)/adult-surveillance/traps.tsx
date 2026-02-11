import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/adult-surveillance/traps')({
	beforeLoad: () => {
		return {
			mainOutlet: {
				header: 'Adult Surveillance',
				description: 'Trap management and monitoring',
			},
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/(app)/adult-surveillance/"!</div>;
}
