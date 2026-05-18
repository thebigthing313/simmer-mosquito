import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_admin/')({
	beforeLoad: () => {
		throw redirect({ to: '/organizations' });
	},
});
