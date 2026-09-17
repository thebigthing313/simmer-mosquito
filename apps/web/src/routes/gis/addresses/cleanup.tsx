import { createFileRoute, redirect } from '@tanstack/react-router';
import { RecordCleanup } from '../../../components/cleanup/record-cleanup';
import { canAttributeWrite } from '../../../hooks/mutations/shared';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/gis/addresses/cleanup')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/gis/addresses/cleanup')) {
			throw redirect({ replace: true, to: '/gis/addresses' });
		}
	},
	component: AddressCleanupRoute,
});

function AddressCleanupRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = canAttributeWrite({ organization, actorProfileId });
	return <RecordCleanup canSubmit={canSubmit} recordType="address" />;
}
