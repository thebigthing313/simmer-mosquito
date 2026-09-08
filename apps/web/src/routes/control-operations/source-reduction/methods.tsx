import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useSourceReductionMethodMutations } from '../../../hooks/mutations/use-catalog-mutations';
import { useSourceReductionMethodRecords } from '../../../hooks/queries/use-catalog-records';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { ControlMethodsPage } from '../-control-methods-page';

export const Route = createFileRoute('/control-operations/source-reduction/methods')({
	component: SourceReductionMethodsRoute,
});

const SourceReductionIcon = iconRegistry.entities.sourceReductionAction.icon;

function SourceReductionMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, canManageOperational } = useOrganizationWorkspace(auth.snapshot);
	const records = useSourceReductionMethodRecords();
	const mutations = useSourceReductionMethodMutations();

	return (
		<ControlMethodsPage
			canEditMethods={canManageOperational}
			canManage={canManage}
			mutations={mutations}
			records={records}
			customFieldsDescription="Extra details crews should capture for this method, such as container type, tire count, or ditch length."
			description="How your crews physically eliminate larval habitat: dumping containers, removing tires, ditching, clearing culverts, and similar work."
			emptyDescription="Source reduction methods name the physical work that removes standing water, such as dumping containers, tire removal, ditching, and culvert clearing."
			icon={SourceReductionIcon}
			namePlaceholder="e.g. Container dumping"
			singularLabel="source reduction method"
			title="Source Reduction Methods"
		/>
	);
}
