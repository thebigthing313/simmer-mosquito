import { createFileRoute, redirect } from '@tanstack/react-router';
import { RecordCleanup } from '../../../components/cleanup/record-cleanup';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/public-engagement/contacts/cleanup')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/public-engagement/contacts/cleanup')) {
			throw redirect({ replace: true, to: '/public-engagement/contacts' });
		}
	},
	component: () => <RecordCleanup recordType="contact" />,
});
