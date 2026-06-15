import { createFileRoute, redirect } from '@tanstack/react-router';
import { DEFAULT_DESIGN, DEFAULT_PAGE } from '../components/layout/registry';

export const Route = createFileRoute('/layout-preview/')({
	beforeLoad: () => {
		throw redirect({
			to: '/layout-preview/$design/$page',
			params: { design: DEFAULT_DESIGN, page: DEFAULT_PAGE },
		});
	},
});
