import { FormSection } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { PlusIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { newRecordId } from '../../../hooks/mutations/shared';
import { recordNoun } from '../../../lib/record-nouns';
import type { InspectionSampleDraft } from './inspection-form-values';

/**
 * The specimens collected on this inspection.
 *
 * They are drafted here and written once the inspection lands, so a crew keys a
 * habitat and everything they took from it in one pass rather than saving, then
 * hunting the record down to add each sample. A blank label records an unlabeled
 * sample, which the domain has its own command for.
 */
export function SamplesSection({
	value,
	isEditing,
	onChange,
}: {
	readonly value: readonly InspectionSampleDraft[];
	readonly isEditing: boolean;
	readonly onChange: (next: readonly InspectionSampleDraft[]) => void;
}) {
	return (
		<FormSection
			note={
				isEditing
					? 'Samples already on this inspection are managed from its record; these are added to them.'
					: null
			}
			title={isEditing ? 'Add Samples' : recordNoun('sample').titleMany}
		>
			<div className="grid gap-3">
				{value.length === 0 ? (
					<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-3 text-muted-foreground text-sm">
						{isEditing
							? 'No samples to add.'
							: 'No specimens collected. Add one for each sample taken during this inspection.'}
					</p>
				) : (
					<ul className="grid gap-2">
						{value.map((sample, index) => (
							<li className="flex items-center gap-2" key={sample.id}>
								<Input
									aria-label={`Sample ${index + 1} label`}
									onChange={(event) =>
										onChange(
											value.map((row) =>
												row.id === sample.id ? { ...row, label: event.target.value } : row,
											),
										)
									}
									placeholder={`Optional label for sample ${index + 1}`}
									value={sample.label}
								/>
								<Button
									aria-label={`Remove sample ${index + 1}`}
									onClick={() => onChange(value.filter((row) => row.id !== sample.id))}
									size="icon"
									type="button"
									variant="ghost"
								>
									<XIcon aria-hidden="true" />
								</Button>
							</li>
						))}
					</ul>
				)}
				<Button
					className="w-fit"
					onClick={() => onChange([...value, { id: newRecordId(), label: '' }])}
					size="sm"
					type="button"
					variant="outline"
				>
					<PlusIcon aria-hidden="true" data-icon="inline-start" />
					Add sample
				</Button>
			</div>
		</FormSection>
	);
}
