import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useInsecticideRecords } from '../../hooks/queries/use-insecticide-records';
import { ArrowRightIcon } from './constants';
import { DomainSection } from './layout/domain-section';
import { LookupListFrame } from './layout/lookup-list-frame';
import { SettingsSectionSheet } from './layout/settings-section-sheet';
import { BATCH_TRACKING_LABEL, batchTrackingSection } from './settings-sections';
import type { DisplaySettingField } from './types';

const ON_OFF_OPTIONS = [
	{ label: 'On', value: 'on' },
	{ label: 'Off', value: 'off' },
] as const;

/**
 * The Insecticides card: the batch tracking setting as it is saved, the sheet
 * that edits it for a viewer who can manage the Organization, and a pointer to
 * where the insecticides themselves are managed. Takes the viewer's floor and
 * the Organization's settings.
 */
export function InsecticidesSection({
	canManage,
	settings,
}: {
	readonly canManage: boolean;
	readonly settings: OrganizationSettings;
}) {
	const batchTracking: DisplaySettingField = {
		label: BATCH_TRACKING_LABEL,
		value: settings.controlOperations.trackInsecticideBatches ? 'on' : 'off',
		options: ON_OFF_OPTIONS,
	};

	return (
		<DomainSection
			canManage={canManage}
			displayFields={[batchTracking]}
			editAction={<SettingsSectionSheet section={batchTrackingSection} settings={settings} />}
			id="insecticides"
			meta="Chemical products, labels, registration, and batch traceability"
			title="Insecticides"
		>
			<InsecticideLookupPointer />
		</DomainSection>
	);
}

/**
 * Insecticides and their batches are managed on the control operations route,
 * next to the applications that use them; this shows their counts and points
 * there.
 */
function InsecticideLookupPointer() {
	const products = useInsecticideRecords();
	const activeCount = products.filter((insecticide) => insecticide.isActive).length;

	return (
		<LookupListFrame
			activeCount={activeCount}
			inactiveCount={products.length - activeCount}
			title="Insecticides"
			action={
				<Button asChild size="sm" variant="outline">
					<Link to="/control-operations/chemical/insecticides">
						Manage Insecticides
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
