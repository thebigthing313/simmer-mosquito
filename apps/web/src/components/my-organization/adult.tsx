import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Link } from '@tanstack/react-router';
import { useCollectionMethodRecords } from '../../hooks/queries/use-collection-method-records';
import { CollectionLureLookupList } from './collection-lure-lookup';
import { ArrowRightIcon } from './constants';
import { collectionTimingModeFromFields } from './helpers';
import { LookupListFrame } from './layout/lookup-list-frame';
import { SettingChoiceCard } from './layout/setting-choice-card';
import type { SettingField } from './types';

export function AdultSurveillanceSettings({
	canManage,
	fields,
}: {
	readonly canManage: boolean;
	readonly fields: readonly SettingField[];
}) {
	const timingMode = collectionTimingModeFromFields(fields);

	return (
		<div className="grid gap-3">
			<CollectionTimingGuide mode={timingMode} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup Lists</h3>
				<div className="grid gap-3">
					<CollectionMethodLookupPointer />
					<CollectionLureLookupList canManage={canManage} />
				</div>
			</div>
		</div>
	);
}

function CollectionTimingGuide({ mode }: { readonly mode: AdultCollectionTimingMode }) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<span className="font-medium text-sm text-foreground">Collection timing</span>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					This controls how adult surveillance forms ask crews to record when a trap was collected.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-2">
				<SettingChoiceCard
					active={mode === 'exact_timestamps'}
					description="Use when crews record the exact set and pickup times."
					title="Exact Timestamps"
				>
					<Field className="gap-1">
						<FieldLabel>Set time</FieldLabel>
						<Input disabled value="May 21, 2026 6:00 PM" readOnly />
					</Field>
					<Field className="gap-1">
						<FieldLabel>Pickup time</FieldLabel>
						<Input disabled value="May 22, 2026 7:30 AM" readOnly />
					</Field>
				</SettingChoiceCard>
				<SettingChoiceCard
					active={mode === 'collection_date_duration'}
					description="Use when crews record the collection date and duration."
					title="Collection Date and Duration"
				>
					<Field className="gap-1">
						<FieldLabel>Collection date</FieldLabel>
						<Input disabled value="May 22, 2026" readOnly />
					</Field>
					<Field className="gap-1">
						<FieldLabel>Duration</FieldLabel>
						<Input disabled value="13.5 hours" readOnly />
					</Field>
				</SettingChoiceCard>
			</div>
		</section>
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
