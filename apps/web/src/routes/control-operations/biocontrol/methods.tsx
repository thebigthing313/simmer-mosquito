import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { ControlMethodsPage } from '../-control-methods-page';

const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;

export const Route = createFileRoute('/control-operations/biocontrol/methods')({
	component: BiocontrolMethodsRoute,
});

function BiocontrolMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);

	return (
		<ControlMethodsPage
			canManage={canManage}
			collection={webCollections.biocontrolMethods}
			collectionKey="biocontrolMethods"
			customFieldsDescription="Add fields your crews record on every release — stocking rate, agent life stage, or source hatchery."
			description="The living controls your agency releases against mosquitoes — mosquitofish stocking, larvivorous fish, predacious copepods, and the like."
			emptyDescription="Add the biocontrol methods your agency releases so crews can record them in the field."
			icon={BiocontrolIcon}
			namePlaceholder="e.g. Mosquitofish stocking"
			organization={organization}
			singularLabel="biocontrol method"
			title="Biocontrol Methods"
		/>
	);
}
