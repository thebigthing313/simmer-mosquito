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
import { errorMessageForSave } from '../../lib/save-error';
import { CloseIcon, EditIcon, US_STATE_SELECT_OPTIONS, US_TIMEZONE_OPTIONS } from './constants';
import { organizationDetailsFieldsFrom, validateEmail, watchWrite } from './helpers';
import type { OrganizationDetailsFormValues } from './types';

export function EditOrganizationDetailsSheet({
	defaultValues,
	description,
	title,
}: {
	readonly defaultValues: OrganizationDetailsFormValues;
	readonly description: string;
	readonly title: string;
}) {
	const [open, setOpen] = useState(false);
	const { canWrite, saveOrganizationDetails } = useOrganizationSettingsMutations();
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			try {
				// The conversion throws on an empty required field, so it runs before the
				// sheet closes.
				const fields = organizationDetailsFieldsFrom(value);
				setOpen(false);
				watchWrite(saveOrganizationDetails(fields), 'Unable to save organization details.');
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});

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
							<form.AppField
								name="name"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Organization name is required.' : undefined,
								}}
							>
								{(field) => <field.TextField label="Organization name" />}
							</form.AppField>
							<form.AppField name="mainContactEmail" validators={{ onSubmit: validateEmail }}>
								{(field) => <field.TextField label="Main contact" type="email" />}
							</form.AppField>
							<form.AppField name="phoneNumber">
								{(field) => <field.TextField label="Phone" type="tel" />}
							</form.AppField>
							<form.AppField name="mailingAddressLine1">
								{(field) => <field.TextField label="Street address" />}
							</form.AppField>
							<form.AppField name="mailingAddressLine2">
								{(field) => <field.TextField label="Apt, suite, etc." />}
							</form.AppField>
							<form.AppField name="mailingLocality">
								{(field) => <field.TextField label="City" />}
							</form.AppField>
							<form.AppField name="mailingRegion">
								{(field) => (
									<field.SelectField
										label="State"
										options={US_STATE_SELECT_OPTIONS}
										placeholder="Not set"
									/>
								)}
							</form.AppField>
							<form.AppField name="mailingPostalCode">
								{(field) => <field.TextField label="ZIP code" />}
							</form.AppField>
							<form.AppField
								name="timezone"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Timezone is required.' : undefined,
								}}
							>
								{(field) => <field.SelectField label="Timezone" options={US_TIMEZONE_OPTIONS} />}
							</form.AppField>
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
