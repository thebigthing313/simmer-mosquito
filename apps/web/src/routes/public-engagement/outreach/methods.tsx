import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { ControlMethodsPage } from '../../../components/control-operations/control-methods-page';
import { useOutreachMethodMutations } from '../../../hooks/mutations/use-outreach-method-mutations';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { useCatalogRecords } from '../../../hooks/queries/use-catalog-records';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';

const OutreachIcon = iconRegistry.entities.outreachAction.icon;

export const Route = createFileRoute('/public-engagement/outreach/methods')({
	component: OutreachMethodsRoute,
});

function OutreachMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, canManageOperational } = useOrganizationWorkspace(auth.snapshot);
	const records = useCatalogRecords(catalogs.outreachMethods);
	const mutations = useOutreachMethodMutations();

	return (
		<ControlMethodsPage
			canEditMethods={canManageOperational}
			canManage={canManage}
			mutations={mutations}
			records={records}
			emptyDescription="Add the outreach methods you use so crews can record them in the field."
			icon={OutreachIcon}
			namePlaceholder="e.g. Door hanger"
			singularLabel="outreach method"
			title="Outreach Methods"
		/>
	);
}
