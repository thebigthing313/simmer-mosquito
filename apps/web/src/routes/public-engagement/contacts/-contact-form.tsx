import { createContactCommand } from '@simmer-mosquito/domain';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { useAppForm } from '../../../forms';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import { type ContactFormValues, validateContactForm } from '../-contact-fields';
import { ContactFieldsBlock } from '../-contact-fields-block';

/** Domain issue path -> the form field holding it. */
const CONTACT_FIELD_PATHS: Readonly<Record<string, string>> = {
	contactName: 'contactName',
	company: 'company',
	department: 'department',
	title: 'title',
	preferredPhone: 'preferredPhone',
	alternatePhone: 'alternatePhone',
	email: 'email',
};

export interface ContactFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/public-engagement/contacts' | '/public-engagement/contacts/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface ContactFormPageProps {
	readonly canSubmit: boolean;
	readonly defaultValues: ContactFormValues;
	readonly header: ContactFormHeader;
	readonly submitLabel: string;
	readonly onSave: (values: ContactFormValues) => Promise<void>;
}

export function ContactFormPage({
	canSubmit,
	defaultValues,
	header,
	submitLabel,
	onSave,
}: ContactFormPageProps) {
	const [saveError, setSaveError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidator(
				({ value }: { readonly value: ContactFormValues }) =>
					createContactCommand({
						...FORM_VALIDATION_CONTEXT,
						contactId: FORM_VALIDATION_CONTEXT.organizationId,
						contactName: value.contactName,
						company: value.company,
						department: value.department,
						title: value.title,
						preferredPhone: value.preferredPhone,
						alternatePhone: value.alternatePhone,
						email: value.email,
						wantsEmail: value.wantsEmail,
						wantsSms: value.wantsSms,
						wantsPhone: value.wantsPhone,
					}),
				CONTACT_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			const error = validateContactForm(value);
			if (error !== null) {
				setSaveError(error);
				return;
			}
			try {
				await onSave(value);
			} catch (thrown) {
				setSaveError(thrown instanceof Error ? thrown.message : 'Unable to save contact.');
			}
		},
	});

	return (
		<OutletSimpleLayout>
			<div className="grid gap-6">
				<header className="grid gap-2">
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						params={header.backParams ?? {}}
						to={header.backTo}
					>
						<ArrowLeftIcon aria-hidden="true" />
						{header.backLabel}
					</Link>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
							{header.title}
						</h1>
						<p className="m-0 text-muted-foreground text-sm">{header.description}</p>
					</div>
				</header>

				<form.AppForm>
					<form
						className="grid max-w-[640px] gap-6"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<form.FormErrorAlert title="Unable to Save Contact" />
						{saveError === null ? null : (
							<Alert variant="destructive">
								<AlertTitle>Unable to Save Contact</AlertTitle>
								<AlertDescription>{saveError}</AlertDescription>
							</Alert>
						)}

						<ContactFieldsBlock form={form} />

						<div className="border-border/50 border-t pt-5">
							<form.FormActions>
								<form.ResetButton />
								<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
							</form.FormActions>
						</div>
					</form>
				</form.AppForm>
			</div>
		</OutletSimpleLayout>
	);
}
