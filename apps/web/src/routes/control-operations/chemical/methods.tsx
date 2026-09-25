import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { ControlMethodsPage } from '../../../components/control-operations/control-methods-page';
import { useApplicationMethodMutations } from '../../../hooks/mutations/use-application-method-mutations';
import { useApplicationMethodRecords } from '../../../hooks/queries/use-application-method-records';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';

export const Route = createFileRoute('/control-operations/chemical/methods')({
	component: ApplicationMethodsRoute,
});

function ApplicationMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, canManageOperational } = useOrganizationWorkspace(auth.snapshot);
	const records = useApplicationMethodRecords();
	const mutations = useApplicationMethodMutations();

	return (
		<ControlMethodsPage
			canEditMethods={canManageOperational}
			canManage={canManage}
			mutations={mutations}
			records={records}
			emptyDescription="Application methods describe how a product reaches the target. They are the delivery method on every chemical treatment record."
			icon={iconRegistry.entities.application.icon}
			namePlaceholder="e.g. ULV truck spray"
			singularLabel="application method"
			title="Application Methods"
		/>
	);
}
