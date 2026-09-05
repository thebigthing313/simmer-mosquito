import { RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { type CreateAdminOrganizationInput, createAdminOrganization } from '../../api';
import { useInvalidateOrganizations } from './-organization-data';

export const Route = createFileRoute('/organizations/create')({
	component: CreateOrganizationRoute,
});

const SUBSCRIPTION_OPTIONS = [
	{ value: 'trial', label: 'Trial' },
	{ value: 'active', label: 'Active' },
	{ value: 'suspended', label: 'Suspended' },
	{ value: 'canceled', label: 'Canceled' },
];

type OrganizationFormValues = CreateAdminOrganizationInput;

function emptyOrganization(): OrganizationFormValues {
	return {
		name: '',
		subscriptionStatus: 'trial',
		billingContactName: '',
		billingContactEmail: '',
		subscriptionNotes: '',
		mainContactEmail: '',
		phoneNumber: '',
		mailingCountry: '',
		mailingAddressLine1: '',
		mailingAddressLine2: '',
		mailingLocality: '',
		mailingRegion: '',
		mailingPostalCode: '',
		linkRequesterAsOwner: false,
	};
}

function trimmed(values: OrganizationFormValues): OrganizationFormValues {
	const trim = (value: string) => value.trim();
	return {
		...values,
		name: trim(values.name),
		billingContactName: trim(values.billingContactName),
		billingContactEmail: trim(values.billingContactEmail),
		subscriptionNotes: trim(values.subscriptionNotes),
		mainContactEmail: trim(values.mainContactEmail),
		phoneNumber: trim(values.phoneNumber),
		mailingCountry: trim(values.mailingCountry),
		mailingAddressLine1: trim(values.mailingAddressLine1),
		mailingAddressLine2: trim(values.mailingAddressLine2),
		mailingLocality: trim(values.mailingLocality),
		mailingRegion: trim(values.mailingRegion),
		mailingPostalCode: trim(values.mailingPostalCode),
	};
}

/**
 * Creating an agency.
 *
 * This replaces a slide-over sheet on the directory page. A sheet was the wrong
 * container for it: the form is fourteen fields across three concerns, and the
 * one that most needs deliberation — `linkRequesterAsOwner`, which makes the
 * operator the agency's first owner — was below the fold of a 520px panel.
 * On its own page the whole decision is visible at once.
 */
function CreateOrganizationRoute() {
	const navigate = useNavigate();
	const invalidateOrganizations = useInvalidateOrganizations();
	const [saveError, setSaveError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: emptyOrganization(),
		onSubmit: async ({ value }) => {
			setSaveError(null);
			try {
				const organization = await createAdminOrganization(trimmed(value));
				await invalidateOrganizations();
				toast.success(`${organization.name} created.`);
				await navigate({
					to: '/organizations/$organizationId',
					params: { organizationId: organization.id },
				});
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to create the organization.');
			}
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton>Create Organization</form.SubmitButton>
					</>
				}
				header={{
					title: 'Create Organization',
					description:
						'Add a mosquito control organization. Invite its people from its page once it exists.',
					backTo: '/organizations',
					backLabel: 'Organizations',
				}}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Create Organization" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Create Organization</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<section className="grid gap-5">
					<h2 className="m-0 font-semibold text-foreground text-sm">Organization</h2>
					<form.AppField
						name="name"
						validators={{
							onSubmit: ({ value }: { readonly value: string }) =>
								value.trim().length === 0 ? 'Organization name is required.' : undefined,
						}}
					>
						{(field) => (
							<field.TextField
								label="Organization name"
								maxLength={160}
								placeholder="e.g. Coastal Mosquito Abatement District"
								required
							/>
						)}
					</form.AppField>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="mainContactEmail">
							{(field) => (
								<field.TextField label="Main contact email" maxLength={254} type="email" />
							)}
						</form.AppField>
						<form.AppField name="phoneNumber">
							{(field) => <field.TextField label="Phone" maxLength={64} />}
						</form.AppField>
					</div>
				</section>

				<section className="grid gap-5 border-border/60 border-t pt-5">
					<h2 className="m-0 font-semibold text-foreground text-sm">Subscription</h2>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="subscriptionStatus">
							{(field) => <field.SelectField label="Status" options={SUBSCRIPTION_OPTIONS} />}
						</form.AppField>
						<form.AppField name="billingContactName">
							{(field) => <field.TextField label="Billing contact" maxLength={160} />}
						</form.AppField>
						<form.AppField name="billingContactEmail">
							{(field) => <field.TextField label="Billing email" maxLength={254} type="email" />}
						</form.AppField>
					</div>
					<form.AppField name="subscriptionNotes">
						{(field) => <field.TextareaField label="Notes" maxLength={2000} rows={3} />}
					</form.AppField>
				</section>

				<section className="grid gap-5 border-border/60 border-t pt-5">
					<h2 className="m-0 font-semibold text-foreground text-sm">Mailing address</h2>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="mailingAddressLine1">
							{(field) => <field.TextField label="Address line 1" maxLength={200} />}
						</form.AppField>
						<form.AppField name="mailingAddressLine2">
							{(field) => <field.TextField label="Address line 2" maxLength={200} />}
						</form.AppField>
						<form.AppField name="mailingLocality">
							{(field) => <field.TextField label="City" maxLength={120} />}
						</form.AppField>
						<form.AppField name="mailingRegion">
							{(field) => <field.TextField label="State or region" maxLength={120} />}
						</form.AppField>
						<form.AppField name="mailingPostalCode">
							{(field) => <field.TextField label="Postal code" maxLength={32} />}
						</form.AppField>
						<form.AppField name="mailingCountry">
							{(field) => <field.TextField label="Country" maxLength={64} />}
						</form.AppField>
					</div>
				</section>

				<section className="grid gap-5 border-border/60 border-t pt-5">
					<h2 className="m-0 font-semibold text-foreground text-sm">Access</h2>
					<form.AppField name="linkRequesterAsOwner">
						{(field) => (
							<field.SwitchField
								description="Adds your account as its first owner. Leave off when the customer's own owner will be invited."
								label="Link me as owner"
							/>
						)}
					</form.AppField>
				</section>
			</RecordFormPage>
		</form.AppForm>
	);
}
