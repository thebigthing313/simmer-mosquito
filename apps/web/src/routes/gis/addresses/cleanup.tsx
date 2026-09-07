import { createFileRoute, redirect } from '@tanstack/react-router';
import { RecordCleanup } from '../../../components/cleanup/record-cleanup';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/gis/addresses/cleanup')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/gis/addresses/cleanup')) {
			throw redirect({ replace: true, to: '/gis/addresses' });
		}
	},
	component: () => <RecordCleanup recordType="address" />,
});
