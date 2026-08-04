import { createFileRoute, redirect } from '@tanstack/react-router';
import { UpcomingPage } from '../../../components/app-shell/upcoming-page';
import { isWriteBlocked } from '../../../lib/write-access';

export const Route = createFileRoute('/operations/assignments/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/operations/assignments/$id',
			});
		}
	},
	component: UpcomingPage,
});
