import { ColorPicker } from '@simmer-mosquito/ui-web/components/color-picker';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTagMutations } from '../../hooks/mutations/use-tag-mutations';
import { errorMessageForSave } from '../../lib/save-error';
import { AddIcon, CloseIcon } from './constants';
import { watchWrite } from './helpers';
import { tagFieldsFrom } from './tag-form-values';
import type { TagFormValues } from './types';

export function TagCreatePanel({ onCancel }: { readonly onCancel: () => void }) {
	const mutations = useTagMutations();
	const [values, setValues] = useState<TagFormValues>({
		tagName: '',
		description: '',
		color: '',
		isActive: true,
		relevantEntityTypes: [],
	});

	function createTag() {
		try {
			const write = mutations.create(tagFieldsFrom(values));
			setValues({
				tagName: '',
				description: '',
				color: '',
				isActive: true,
				relevantEntityTypes: [],
			});
			watchWrite(write, 'Unable to create tag.');
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<div className="grid gap-2 rounded-md border border-dashed border-border/50 bg-background/50 p-2.5">
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_132px_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={values.tagName}
						placeholder="e.g. New tag"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
				<Field className="gap-1">
					<FieldLabel>Color</FieldLabel>
					<ColorPicker
						value={values.color}
						onChange={(color) => setValues({ ...values, color: color ?? '' })}
					/>
				</Field>
				<div className="flex items-end gap-2">
					<Button type="button" disabled={!mutations.canWrite} onClick={createTag}>
						<AddIcon aria-hidden="true" />
						Add
					</Button>
					<Button type="button" variant="outline" onClick={onCancel}>
						<CloseIcon aria-hidden="true" />
						Cancel
					</Button>
				</div>
			</div>
			<Field className="gap-1">
				<FieldLabel>Description</FieldLabel>
				<Textarea
					value={values.description}
					className="min-h-14"
					onChange={(event) => setValues({ ...values, description: event.target.value })}
				/>
			</Field>
		</div>
	);
}
