import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The console has no dashboard. Organizations are what an operator arrives to
 * do something about, so the root is the directory rather than a summary screen
 * nobody asked for.
 */
export const Route = createFileRoute('/')({
	beforeLoad: () => {
		throw redirect({ to: '/organizations' });
	},
});
