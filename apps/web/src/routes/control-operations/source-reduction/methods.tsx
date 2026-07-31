import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { ControlMethodsPage } from '../-control-methods-page';

export const Route = createFileRoute('/control-operations/source-reduction/methods')({
	component: SourceReductionMethodsRoute,
});

const SourceReductionIcon = iconRegistry.entities.sourceReductionAction.icon;

function SourceReductionMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);

	return (
		<ControlMethodsPage
			canManage={canManage}
			collection={webCollections.sourceReductionMethods}
			collectionKey="sourceReductionMethods"
			customFieldsDescription="Extra details crews should capture for this method — container type, tire count, ditch length, and so on."
			description="How your crews physically eliminate larval habitat — dumping containers, removing tires, ditching, clearing culverts, and similar work."
			emptyDescription="Source reduction methods name the physical work that removes standing water — dumping containers, tire removal, ditching, culvert clearing."
			icon={SourceReductionIcon}
			namePlaceholder="e.g. Container dumping"
			organization={organization}
			singularLabel="source reduction method"
			title="Source Reduction Methods"
		/>
	);
}
