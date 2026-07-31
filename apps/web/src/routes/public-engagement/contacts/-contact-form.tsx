import type { ContactRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { useAppForm } from '../../../forms';

/** The mutable, contact-owned fields (everything except id/org/audit/metadata). */
export type ContactFields = Pick<
	ContactRow,
	| 'contactName'
	| 'company'
	| 'department'
	| 'title'
	| 'preferredPhone'
	| 'alternatePhone'
	| 'email'
	| 'wantsEmail'
	| 'wantsSms'
	| 'wantsPhone'
>;

/** Normalize form values into the contact row fields (blanks become null). */
export function contactFieldsFromValues(values: ContactFormValues): ContactFields {
	return {
		contactName: nullableText(values.contactName),
		company: nullableText(values.company),
		department: nullableText(values.department),
		title: nullableText(values.title),
		preferredPhone: nullableText(values.preferredPhone),
		alternatePhone: nullableText(values.alternatePhone),
		email: nullableText(values.email),
		wantsEmail: values.wantsEmail,
		wantsSms: values.wantsSms,
		wantsPhone: values.wantsPhone,
	};
}

export function defaultsFromContact(contact: ContactRow): ContactFormValues {
	return {
		contactName: contact.contactName ?? '',
		company: contact.company ?? '',
		department: contact.department ?? '',
		title: contact.title ?? '',
		preferredPhone: contact.preferredPhone ?? '',
		alternatePhone: contact.alternatePhone ?? '',
		email: contact.email ?? '',
		wantsEmail: contact.wantsEmail,
		wantsSms: contact.wantsSms,
		wantsPhone: contact.wantsPhone,
	};
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}

export interface ContactFormValues {
	readonly contactName: string;
	readonly company: string;
	readonly department: string;
	readonly title: string;
	readonly preferredPhone: string;
	readonly alternatePhone: string;
	readonly email: string;
	readonly wantsEmail: boolean;
	readonly wantsSms: boolean;
	readonly wantsPhone: boolean;
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
	readonly submitLabel: string;
	readonly onSave: (values: ContactFormValues) => Promise<void>;
}

export function defaultContactFormValues(): ContactFormValues {
	return {
		contactName: '',
		company: '',
		department: '',
		title: '',
		preferredPhone: '',
		alternatePhone: '',
		email: '',
		wantsEmail: false,
		wantsSms: false,
		wantsPhone: false,
	};
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

						<FormSection
							description="A contact needs at least one identifier — a name, company, phone, or email."
							title="Identity"
						>
							<form.AppField name="contactName">
								{(field) => <field.TextField label="Name" placeholder="e.g. Jordan Rivera" />}
							</form.AppField>
							<div className="grid gap-5 sm:grid-cols-2">
								<form.AppField name="company">
									{(field) => <field.TextField label="Company" placeholder="e.g. Riverside HOA" />}
								</form.AppField>
								<form.AppField name="department">
									{(field) => <field.TextField label="Department" placeholder="e.g. Facilities" />}
								</form.AppField>
							</div>
							<form.AppField name="title">
								{(field) => <field.TextField label="Title" placeholder="e.g. Property Manager" />}
							</form.AppField>
						</FormSection>

						<FormSection title="Communication">
							<div className="grid gap-5 sm:grid-cols-2">
								<form.AppField name="preferredPhone">
									{(field) => (
										<field.TextField label="Preferred phone" placeholder="(555) 123-4567" />
									)}
								</form.AppField>
								<form.AppField name="alternatePhone">
									{(field) => (
										<field.TextField label="Alternate phone" placeholder="(555) 987-6543" />
									)}
								</form.AppField>
							</div>
							<form.AppField name="email">
								{(field) => <field.TextField label="Email" placeholder="name@example.com" />}
							</form.AppField>
						</FormSection>

						<FormSection
							description="How this contact prefers to be reached for notifications and follow-up."
							title="Notification Preferences"
						>
							<form.AppField name="wantsEmail">
								{(field) => (
									<field.SwitchField description="Requires an email address." label="Wants email" />
								)}
							</form.AppField>
							<form.AppField name="wantsSms">
								{(field) => (
									<field.SwitchField
										description="Requires a preferred phone number."
										label="Wants SMS"
									/>
								)}
							</form.AppField>
							<form.AppField name="wantsPhone">
								{(field) => (
									<field.SwitchField
										description="Requires a preferred phone number."
										label="Wants phone calls"
									/>
								)}
							</form.AppField>
						</FormSection>

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

/**
 * Client-side mirror of the domain's contact rules (`normalizeCreateContactDetails`):
 * at least one identifier, alternate phone needs a preferred phone, and each
 * "wants" preference needs its channel. The server re-validates authoritatively.
 */
export function validateContactForm(values: ContactFormValues): string | null {
	const hasName = values.contactName.trim().length > 0;
	const hasCompany = values.company.trim().length > 0;
	const hasPreferred = values.preferredPhone.trim().length > 0;
	const hasAlternate = values.alternatePhone.trim().length > 0;
	const hasEmail = values.email.trim().length > 0;

	if (!hasName && !hasCompany && !hasPreferred && !hasAlternate && !hasEmail) {
		return 'Enter at least one identifier — a name, company, phone, or email.';
	}
	if (hasAlternate && !hasPreferred) {
		return 'An alternate phone requires a preferred phone.';
	}
	if (values.wantsEmail && !hasEmail) {
		return 'Wants email requires an email address.';
	}
	if ((values.wantsSms || values.wantsPhone) && !hasPreferred) {
		return 'SMS and phone preferences require a preferred phone.';
	}
	return null;
}

function FormSection({
	title,
	description,
	children,
}: {
	readonly title: string;
	readonly description?: string;
	readonly children: React.ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<div className="grid gap-0.5">
				<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
				{description === undefined ? null : (
					<p className="m-0 text-muted-foreground text-xs">{description}</p>
				)}
			</div>
			{children}
		</section>
	);
}
