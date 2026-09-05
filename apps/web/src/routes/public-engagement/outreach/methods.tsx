import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useOutreachMethodMutations } from '../../../hooks/mutations/use-catalog-mutations';
import { useOutreachMethodRecords } from '../../../hooks/queries/use-catalog-records';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { ControlMethodsPage } from '../../control-operations/-control-methods-page';

const OutreachIcon = iconRegistry.entities.outreachAction.icon;

export const Route = createFileRoute('/public-engagement/outreach/methods')({
	component: OutreachMethodsRoute,
});

function OutreachMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, canManageOperational } = useOrganizationWorkspace(auth.snapshot);
	const records = useOutreachMethodRecords();
	const mutations = useOutreachMethodMutations();

	return (
		<ControlMethodsPage
			canEditMethods={canManageOperational}
			canManage={canManage}
			mutations={mutations}
			records={records}
			customFieldsDescription="Add fields your crews record on every action — audience, language, or materials handed out."
			// vocabulary-ignore site: a site visit is the industry name for this outreach method.
			description="The ways you reach the public — door hangers, site visits, presentations, mailers, and social posts."
			emptyDescription="Add the outreach methods you use so crews can record them in the field."
			icon={OutreachIcon}
			namePlaceholder="e.g. Door hanger"
			singularLabel="outreach method"
			title="Outreach Methods"
		/>
	);
}
