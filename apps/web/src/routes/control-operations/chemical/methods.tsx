import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { ControlMethodsPage } from '../-control-methods-page';

export const Route = createFileRoute('/control-operations/chemical/methods')({
	component: ApplicationMethodsRoute,
});

function ApplicationMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);

	return (
		<ControlMethodsPage
			canManage={canManage}
			collection={webCollections.applicationMethods}
			collectionKey="applicationMethods"
			customFieldsDescription="Add fields crews should capture with every application made this way — droplet size classification, swath width, or an equipment calibration note."
			description="How your agency applies insecticide — ULV truck spray, aerial application, backpack low-volume, granular spreader, barrier and residual treatment, and any other delivery method crews record against."
			emptyDescription="Application methods describe how a product reaches the target — they are the delivery method on every chemical treatment record."
			icon={iconRegistry.entities.application.icon}
			namePlaceholder="e.g. ULV truck spray"
			organization={organization}
			singularLabel="application method"
			title="Application Methods"
		/>
	);
}
