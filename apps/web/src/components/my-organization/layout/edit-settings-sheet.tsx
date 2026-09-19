import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import type React from 'react';
import { useState } from 'react';
import { errorMessageForSave } from '../../../lib/save-error';
import { EditIcon } from '../constants';
import { collectionTimingModeFromFields } from '../helpers';
import type { SettingField, SwitchSettingField } from '../types';

export function EditSettingsSheet({
	description,
	fields,
	onSave,
	title,
}: {
	readonly description: string;
	readonly fields: readonly SettingField[];
	readonly onSave?: ((formData: FormData) => unknown) | undefined;
	readonly title: string;
}) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const timingMode = collectionTimingModeFromFields(fields);
	const [selectedTimingMode, setSelectedTimingMode] = useState(timingMode);
	const showsCollectionTiming = fields.some((field) => field.label === 'Collection timing');

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (onSave === undefined) {
			setOpen(false);
			return;
		}

		setError(null);
		try {
			await onSave(new FormData(event.currentTarget));
			setOpen(false);
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		}
	}

	return (
		<Sheet
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) {
					setSelectedTimingMode(timingMode);
				}
				setOpen(nextOpen);
			}}
		>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-2.5 px-4">
						{fields.map((field) => (
							<SettingsEditor
								field={field}
								key={field.label}
								onCollectionTimingChange={setSelectedTimingMode}
							/>
						))}
						{showsCollectionTiming ? <CollectionTimingGuide mode={selectedTimingMode} /> : null}
					</div>
					{error === null ? null : (
						<p className="m-0 px-4 text-sm leading-snug text-destructive">{error}</p>
					)}
					<SheetFooter>
						<Button type="submit" disabled={onSave === undefined}>
							Save Changes
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function SettingsEditor({
	field,
	onCollectionTimingChange,
}: {
	readonly field: SettingField;
	readonly onCollectionTimingChange?: ((mode: AdultCollectionTimingMode) => void) | undefined;
}) {
	if (field.kind === 'switch') {
		return <SwitchEditor field={field} />;
	}

	if (field.kind === 'select') {
		return (
			<Field className="min-w-0 gap-1">
				<FieldLabel>{field.label}</FieldLabel>
				<Select
					defaultValue={field.value}
					disabled={!field.editable}
					name={field.label}
					onValueChange={(value) => {
						if (
							field.label === 'Collection timing' &&
							(value === 'exact_timestamps' || value === 'collection_date_duration')
						) {
							onCollectionTimingChange?.(value);
						}
					}}
				>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue placeholder="Not set" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{field.options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
		);
	}

	return (
		<Field className="min-w-0 gap-1">
			<FieldLabel>{field.label}</FieldLabel>
			<Input
				defaultValue={field.value}
				disabled={!field.editable}
				name={field.label}
				type={field.inputType ?? 'text'}
			/>
		</Field>
	);
}

function SwitchEditor({ field }: { readonly field: SwitchSettingField }) {
	const [checked, setChecked] = useState(field.checked);

	return (
		<Field className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border border-border/30 bg-muted/40 px-2.5 py-0">
			<FieldLabel>{field.label}</FieldLabel>
			<Switch checked={checked} disabled={!field.editable} onCheckedChange={setChecked} />
			<input
				type="hidden"
				name={field.label}
				value={checked ? 'true' : 'false'}
				disabled={!field.editable}
			/>
		</Field>
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
				<div
					className="grid gap-1 rounded-md border border-border/30 bg-background p-2 data-[active=true]:border-primary/35"
					data-active={mode === 'exact_timestamps'}
				>
					<span className="font-medium text-sm text-foreground">Exact timestamps</span>
					<p className="m-0 text-xs text-muted-foreground">Set time and pickup time.</p>
				</div>
				<div
					className="grid gap-1 rounded-md border border-border/30 bg-background p-2 data-[active=true]:border-primary/35"
					data-active={mode === 'collection_date_duration'}
				>
					<span className="font-medium text-sm text-foreground">Collection date and duration</span>
					<p className="m-0 text-xs text-muted-foreground">Collection date plus duration.</p>
				</div>
			</div>
		</section>
	);
}
