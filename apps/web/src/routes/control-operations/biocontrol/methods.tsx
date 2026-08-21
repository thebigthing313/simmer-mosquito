import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useBiocontrolMethodMutations } from '../../../hooks/mutations/use-catalog-mutations';
import { useBiocontrolMethodRecords } from '../../../hooks/queries/use-catalog-records';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { ControlMethodsPage } from '../-control-methods-page';

const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;

export const Route = createFileRoute('/control-operations/biocontrol/methods')({
	component: BiocontrolMethodsRoute,
});

function BiocontrolMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, canManageOperational } = useOrganizationWorkspace(auth.snapshot);
	const records = useBiocontrolMethodRecords();
	const mutations = useBiocontrolMethodMutations();

	return (
		<ControlMethodsPage
			canEditMethods={canManageOperational}
			canManage={canManage}
			mutations={mutations}
			records={records}
			customFieldsDescription="Add fields your crews record on every release — stocking rate, agent life stage, or source hatchery."
			description="The living controls your agency releases against mosquitoes — mosquitofish stocking, larvivorous fish, predacious copepods, and the like."
			emptyDescription="Add the biocontrol methods your agency releases so crews can record them in the field."
			icon={BiocontrolIcon}
			namePlaceholder="e.g. Mosquitofish stocking"
			singularLabel="biocontrol method"
			title="Biocontrol Methods"
		/>
	);
}
