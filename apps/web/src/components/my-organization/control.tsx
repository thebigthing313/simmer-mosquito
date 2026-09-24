import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Link } from '@tanstack/react-router';
import type { CatalogRecords, ControlMethodRecord } from '../../hooks/queries/catalog-record-view';
import { useApplicationMethodRecords } from '../../hooks/queries/use-application-method-records';
import { useBiocontrolMethodRecords } from '../../hooks/queries/use-biocontrol-method-records';
import { useSourceReductionMethodRecords } from '../../hooks/queries/use-source-reduction-method-records';
import { ArrowRightIcon, controlMethodListConfigs } from './constants';
import { EquipmentLookupList, VehicleLookupList } from './control-asset-lookup';
import { LookupListFrame } from './layout/lookup-list-frame';
import type { ControlMethodCollectionKey } from './types';

export function ControlOperationsSettings({
	canManageAssets,
}: {
	/**
	 * Vehicles and equipment are `MANAGER` on the server, not `ADMIN`. The method
	 * entries beside them are links, so this is the only floor this section needs.
	 */
	readonly canManageAssets: boolean;
}) {
	const applicationMethods = useApplicationMethodRecords();
	const sourceReductionMethods = useSourceReductionMethodRecords();
	const biocontrolMethods = useBiocontrolMethodRecords();

	return (
		<div className="grid gap-3">
			<div className="grid gap-2">
				<h3 className={eyebrow({ tone: 'primary', className: 'mt-0.5' })}>Setup Lists</h3>
				<div className="grid gap-3">
					<ControlMethodLookupPointer
						collectionKey="applicationMethods"
						records={applicationMethods}
						to="/control-operations/chemical/methods"
					/>
					<ControlMethodLookupPointer
						collectionKey="sourceReductionMethods"
						records={sourceReductionMethods}
						to="/control-operations/source-reduction/methods"
					/>
					<ControlMethodLookupPointer
						collectionKey="biocontrolMethods"
						records={biocontrolMethods}
						to="/control-operations/biocontrol/methods"
					/>
					<VehicleLookupList canManage={canManageAssets} />
					<EquipmentLookupList canManage={canManageAssets} />
				</div>
			</div>
		</div>
	);
}

/**
 * Methods are managed on the control operations routes, next to the work that
 * uses them; this shows their counts and points there.
 */
function ControlMethodLookupPointer({
	collectionKey,
	records,
	to,
}: {
	readonly collectionKey: Exclude<ControlMethodCollectionKey, 'outreachMethods'>;
	readonly records: CatalogRecords<ControlMethodRecord>;
	readonly to:
		| '/control-operations/chemical/methods'
		| '/control-operations/source-reduction/methods'
		| '/control-operations/biocontrol/methods';
}) {
	const config = controlMethodListConfigs[collectionKey];

	return (
		<LookupListFrame
			activeCount={records.activeRecords.length}
			inactiveCount={records.inactiveRecords.length}
			title={config.title}
			action={
				<Button asChild size="sm" variant="outline">
					<Link to={to}>
						Manage Methods
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
				{config.title} are managed in Control Operations, alongside the work that uses them.
			</p>
		</LookupListFrame>
	);
}
