import { createFileRoute, redirect } from '@tanstack/react-router';
import { HabitatMerge } from '../../../components/cleanup/habitat-merge';
import { canAttributeWrite } from '../../../hooks/mutations/shared';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/larval-surveillance/habitats/$id_/merge')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/larval-surveillance/habitats/$id/merge')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/larval-surveillance/habitats/$id',
			});
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = canAttributeWrite({ organization, actorProfileId });
	return <HabitatMerge canSubmit={canSubmit} habitatId={id} />;
}
