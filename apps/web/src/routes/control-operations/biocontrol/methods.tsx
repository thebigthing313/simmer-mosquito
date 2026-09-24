import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { ControlMethodsPage } from '../../../components/control-operations/control-methods-page';
import { useBiocontrolMethodMutations } from '../../../hooks/mutations/use-biocontrol-method-mutations';
import { useBiocontrolMethodRecords } from '../../../hooks/queries/use-biocontrol-method-records';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';

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
			emptyDescription="Add the biocontrol methods you release so crews can record them in the field."
			icon={BiocontrolIcon}
			namePlaceholder="e.g. Mosquitofish stocking"
			singularLabel="biocontrol method"
			title="Biocontrol Methods"
		/>
	);
}
