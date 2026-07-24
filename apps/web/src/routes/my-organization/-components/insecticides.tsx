import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type { InsecticideRow, OrganizationRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { Collection } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { ArrowRightIcon } from './constants';
import { saveControlSettingsFromValues } from './helpers';
import { EditSettingsSheet, LookupListFrame } from './layout/layout';

/**
 * Insecticides and their batches are managed on the control operations route, next to the
 * applications that use them. This keeps their counts visible in settings and points at the one
 * place that edits them.
 */
export function InsecticideLookupPointer({
	insecticides,
}: {
	readonly insecticides: Collection<InsecticideRow, string | number>;
}) {
	const { rows } = useCollectionRows<InsecticideRow>(insecticides);
	const activeCount = rows.filter((insecticide) => isActiveValue(insecticide.isActive)).length;

	return (
		<LookupListFrame
			activeCount={activeCount}
			inactiveCount={rows.length - activeCount}
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
			<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-[0.84rem] text-muted-foreground">
				Insecticides and their batches are managed in Control Operations, alongside the applications
				that use them.
			</p>
		</LookupListFrame>
	);
}

export function InsecticideBatchTrackingDrawer({
	canManage,
	organization,
	settings,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
}) {
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
				saveControlSettingsFromValues(organization, settings, {
					trackInsecticideBatches: formData.get('Track insecticide batches') === 'true',
				})
			}
			title="Edit Batch Tracking"
		/>
	);
}

function isActiveValue(value: boolean | string): boolean {
	return value === true || value === 'true';
}
