import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useCollectionMethodRecords } from '../../hooks/queries/use-collection-method-records';
import { CollectionLureLookupList } from './collection-lure-lookup';
import { CollectionTimingGuide } from './collection-timing-guide';
import { ArrowRightIcon } from './constants';
import { LookupListFrame } from './layout/lookup-list-frame';

export function AdultSurveillanceSettings({
	canManage,
	timingMode,
}: {
	readonly canManage: boolean;
	readonly timingMode: AdultCollectionTimingMode;
}) {
	return (
		<div className="grid gap-3">
			<CollectionTimingGuide mode={timingMode} />
			<div className="grid gap-2">
				<h3 className={eyebrow({ tone: 'primary', className: 'mt-0.5' })}>Setup Lists</h3>
				<div className="grid gap-3">
					<CollectionMethodLookupPointer />
					<CollectionLureLookupList canManage={canManage} />
				</div>
			</div>
		</div>
	);
}

/**
 * Methods are managed on the adult surveillance route, next to the traps that
 * use them; this shows their counts and points there.
 */
function CollectionMethodLookupPointer() {
	const { activeRecords, inactiveRecords } = useCollectionMethodRecords();

	return (
		<LookupListFrame
			activeCount={activeRecords.length}
			inactiveCount={inactiveRecords.length}
			title="Collection Methods"
			action={
				<Button asChild size="sm" variant="outline">
					<Link to="/adult-surveillance/collection-methods">
						Manage Methods
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
				Collection methods are managed in Adult Surveillance, alongside the traps that use them.
			</p>
		</LookupListFrame>
	);
}
