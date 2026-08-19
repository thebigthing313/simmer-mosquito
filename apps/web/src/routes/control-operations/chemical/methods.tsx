import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useApplicationMethodMutations } from '../../../hooks/mutations/use-catalog-mutations';
import { useApplicationMethodRecords } from '../../../hooks/queries/use-catalog-records';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { ControlMethodsPage } from '../-control-methods-page';

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
			customFieldsDescription="Add fields crews should capture with every application made this way — droplet size classification, swath width, or an equipment calibration note."
			description="How your agency applies insecticide — ULV truck spray, aerial application, backpack low-volume, granular spreader, barrier and residual treatment, and any other delivery method crews record against."
			emptyDescription="Application methods describe how a product reaches the target — they are the delivery method on every chemical treatment record."
			icon={iconRegistry.entities.application.icon}
			namePlaceholder="e.g. ULV truck spray"
			singularLabel="application method"
			title="Application Methods"
		/>
	);
}
