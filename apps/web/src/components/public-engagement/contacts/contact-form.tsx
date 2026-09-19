import { createContactCommand } from '@simmer-mosquito/domain';
import { RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../lib/domain-validation';
import { CONTACT_FIELD_PATHS, type ContactFormValues } from '../contact-fields';
import { ContactFieldsBlock } from '../contact-fields-block';

/**
 * Domain issue path to the form field holding it. `createContactCommand`
 * validates the details under the `contact` prefix; the fields sit at the root
 * of this form, so the prefix comes off.
 */
const FIELD_PATHS: Readonly<Record<string, string>> = Object.fromEntries(
	CONTACT_FIELD_PATHS.map((field) => [`contact.${field}`, field]),
);

/**
 * The form's rules, straight from the domain builder: at least one
 * identifier, an alternate phone needs a preferred one, and each notification
 * preference needs its channel. The identifier rule is reported against the
 * details object rather than a field, so it stays in the alert.
 */
export function validateContact(value: ContactFormValues) {
	return domainValidator(
		() =>
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
		FIELD_PATHS,
	)({ value });
}

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
	readonly onSave: (values: ContactFormValues) => Promise<void>;
}

export function ContactFormPage({
	canSubmit,
	defaultValues,
	header,
	onSave,
}: ContactFormPageProps) {
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: ContactFormValues }) => validateContact(value),
		},
		onSubmit: async ({ value }) => {
			await onSave(value);
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit} />
					</>
				}
				header={header}
				measure="record"
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				{/* A contact is all short single-value fields; a full-width measure would
				    strand each label a screen away from its input. */}
				<div className="grid max-w-[640px] gap-6">
					<form.FormErrorAlert title="Unable to Save Contact" />

					<ContactFieldsBlock form={form} />
				</div>
			</RecordFormPage>
		</form.AppForm>
	);
}
