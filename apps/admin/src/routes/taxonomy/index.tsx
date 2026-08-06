import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/taxonomy/')({
	beforeLoad: () => {
		throw redirect({ to: '/taxonomy/genera' });
	},
});
