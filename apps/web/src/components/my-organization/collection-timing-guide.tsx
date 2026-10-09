import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { useId } from 'react';
import { SettingChoiceCard } from './layout/setting-choice-card';

/**
 * The two ways an adult surveillance form can ask when a trap was collected,
 * each with sample inputs, and `mode` marked as the current one.
 */
export function CollectionTimingGuide({ mode }: { readonly mode: AdultCollectionTimingMode }) {
	const id = useId();
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
						<FieldLabel htmlFor={`${id}-set-time`}>Set time</FieldLabel>
						<Input id={`${id}-set-time`} disabled value="May 21, 2026 6:00 PM" readOnly />
					</Field>
					<Field className="gap-1">
						<FieldLabel htmlFor={`${id}-pickup-time`}>Pickup time</FieldLabel>
						<Input id={`${id}-pickup-time`} disabled value="May 22, 2026 7:30 AM" readOnly />
					</Field>
				</SettingChoiceCard>
				<SettingChoiceCard
					active={mode === 'collection_date_duration'}
					description="Use when crews record the collection date and duration."
					title="Collection Date and Duration"
				>
					<Field className="gap-1">
						<FieldLabel htmlFor={`${id}-collection-date`}>Collection date</FieldLabel>
						<Input id={`${id}-collection-date`} disabled value="May 22, 2026" readOnly />
					</Field>
					<Field className="gap-1">
						<FieldLabel htmlFor={`${id}-duration`}>Duration</FieldLabel>
						<Input id={`${id}-duration`} disabled value="13.5 hours" readOnly />
					</Field>
				</SettingChoiceCard>
			</div>
		</section>
	);
}
