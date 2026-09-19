import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
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
import { useState } from 'react';
import { toast } from 'sonner';
import { useOrganizationSettingsMutations } from '../../hooks/mutations/use-organization-settings-mutations';
import type { UnitLabel } from '../../hooks/queries/use-unit-labels';
import { titleCaseToken } from '../../lib/record-display';
import { errorMessageForSave } from '../../lib/save-error';
import { CloseIcon, EditIcon } from './constants';
import { unitDefaultsFrom, unitOptionsForDefault, watchWrite } from './helpers';
import type { UnitDefaultsFormValues } from './types';

export function EditUnitDefaultsSheet({
	defaultValues,
	description,
	title,
	units,
}: {
	readonly defaultValues: UnitDefaultsFormValues;
	readonly description: string;
	readonly title: string;
	readonly units: readonly UnitLabel[];
}) {
	const [open, setOpen] = useState(false);
	const { canWrite, setUnitDefaults } = useOrganizationSettingsMutations();
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			try {
				const unitDefaults = unitDefaultsFrom(value);
				setOpen(false);
				watchWrite(setUnitDefaults(unitDefaults), 'Unable to save unit defaults.');
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});
	const unitTypes = Object.keys(defaultValues) as Array<keyof UnitDefaultsFormValues>;

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
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
				<form.AppForm>
					<form
						className="grid gap-3.5"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid gap-2.5 px-4">
							<form.FormErrorAlert />
							{unitTypes.map((unitType) => (
								<form.AppField
									key={unitType}
									name={unitType}
									validators={{
										onSubmit: ({ value }) =>
											value.trim().length === 0
												? `${titleCaseToken(unitType)} is required.`
												: undefined,
									}}
								>
									{(field) => (
										<field.SelectField
											label={titleCaseToken(unitType)}
											options={unitOptionsForDefault(
												defaultValues[unitType],
												units.filter((unit) => unit.unitType === unitType),
											)}
										/>
									)}
								</form.AppField>
							))}
						</div>
						<SheetFooter>
							<form.FormActions>
								<form.SubmitButton disabled={!canWrite} />
								<SheetClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</SheetClose>
							</form.FormActions>
						</SheetFooter>
					</form>
				</form.AppForm>
			</SheetContent>
		</Sheet>
	);
}
