import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useOrganizationSettingsMutations } from '../../../hooks/mutations/use-organization-settings-mutations';
import { useInsecticideRecords } from '../../../hooks/queries/use-insecticide-records';
import { ArrowRightIcon } from './constants';
import { EditSettingsSheet, LookupListFrame } from './layout/layout';

/**
 * Insecticides and their batches are managed on the control operations route, next to the
 * applications that use them. This keeps their counts visible in settings and points at the one
 * place that edits them.
 */
export function InsecticideLookupPointer() {
	const products = useInsecticideRecords();
	const activeCount = products.filter((insecticide) => insecticide.isActive).length;

	return (
		<LookupListFrame
			activeCount={activeCount}
			inactiveCount={products.length - activeCount}
			detail="Products used for chemical control, including active ingredient, registration, and default usage unit."
			title="Insecticides"
			action={
				<Button asChild size="sm" variant="outline">
					<Link to="/control-operations/chemical/insecticides">
						Manage insecticides
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
				Insecticides and their batches are managed in Control Operations, alongside the applications
				that use them.
			</p>
		</LookupListFrame>
	);
}

export function InsecticideBatchTrackingDrawer({
	canManage,
	settings,
}: {
	readonly canManage: boolean;
	readonly settings: OrganizationSettings;
}) {
	const { setInsecticideBatchTracking } = useOrganizationSettingsMutations();

	return (
		<EditSettingsSheet
			description="Choose whether treatment records should capture insecticide lot or batch details."
			fields={[
				{
					kind: 'switch',
					label: 'Track insecticide batches',
					checked: settings.controlOperations.trackInsecticideBatches,
					editable: canManage,
				},
			]}
			onSave={(formData) =>
				setInsecticideBatchTracking(formData.get('Track insecticide batches') === 'true')
			}
			title="Edit Batch Tracking"
		/>
	);
}
