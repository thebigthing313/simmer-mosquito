import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { ControlMethodsPage } from '../../control-operations/-control-methods-page';

const OutreachIcon = iconRegistry.entities.outreachAction.icon;

export const Route = createFileRoute('/public-engagement/outreach/methods')({
	component: OutreachMethodsRoute,
});

function OutreachMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);

	return (
		<ControlMethodsPage
			canManage={canManage}
			collection={webCollections.outreachMethods}
			collectionKey="outreachMethods"
			customFieldsDescription="Add fields your crews record on every action — audience, language, or materials handed out."
			description="The ways your agency reaches the public — door hangers, site visits, presentations, mailers, and social posts."
			emptyDescription="Add the outreach methods your agency uses so crews can record them in the field."
			icon={OutreachIcon}
			namePlaceholder="e.g. Door hanger"
			organization={organization}
			singularLabel="outreach method"
			title="Outreach Methods"
		/>
	);
}
