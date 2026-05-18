import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type FormEvent, useEffect, useState } from 'react';
import {
	type AdminAgency,
	type CreateAdminAgencyInput,
	createAdminAgency,
	getServerUrl,
	listAdminAgencies,
} from '../api';
import {
	AdminEmpty,
	FormActions,
	FormGrid,
	PageHeading,
	PageShell,
	RecordActions,
	StatusMessage,
} from '../components/AdminPrimitives';
import { Panel, type Tone, ToneBadge } from '../components/Panel';

const serverUrl = getServerUrl();

export const Route = createFileRoute('/_authenticated/_admin/organizations')({
	component: OrganizationsRoute,
});

function OrganizationsRoute() {
	const [createOpen, setCreateOpen] = useState(false);
	const [organizations, setOrganizations] = useState<AdminAgency[]>([]);
	const [status, setStatus] = useState('Loading organizations...');
	const [form, setForm] = useState<CreateAdminAgencyInput>({
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
	});

	useEffect(() => {
		let cancelled = false;
		listAdminAgencies(serverUrl)
			.then((result) => {
				if (!cancelled) {
					setOrganizations(result);
					setStatus('');
				}
			})
			.catch((loadError: unknown) => {
				if (!cancelled) {
					setStatus(
						loadError instanceof Error ? loadError.message : 'Unable to load organizations.',
					);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus('Creating organization...');
		try {
			const organization = await createAdminAgency(form, serverUrl);
			setOrganizations((current) => [organization, ...current]);
			setForm({ ...emptyOrganizationForm(), subscriptionStatus: form.subscriptionStatus });
			setCreateOpen(false);
			setStatus('Organization created.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to create organization.');
		}
	}

	return (
		<PageShell className="gap-[18px]">
			<PageHeading
				description="Manage SIMMER customer organizations and the users connected to each one."
				eyebrow="Customer setup"
				title="Organizations"
			/>

			<div className="flex justify-end">
				<Button type="button" onClick={() => setCreateOpen(true)}>
					New organization
				</Button>
			</div>

			<Panel title="Customer organizations">
				<p className="mb-5 text-muted-foreground">
					Open an organization to invite users and review membership setup.
				</p>

				<StatusMessage>{status}</StatusMessage>

				{organizations.length === 0 && status === '' ? (
					<AdminEmpty
						action={
							<Button variant="secondary" type="button" onClick={() => setCreateOpen(true)}>
								Create organization
							</Button>
						}
						description="Create the first SIMMER customer organization when onboarding is ready."
						title="No organizations yet"
					/>
				) : (
					<div className="list organization-list">
						{organizations.map((organization) => (
							<article className="row organization-row" key={organization.id}>
								<div className="organization-summary">
									<div className="organization-identity">
										<h3>{organization.name}</h3>
										<p className="code-text">
											{organization.workosOrganizationId ?? 'External identity not linked'}
										</p>
									</div>
									<div className="organization-meta">
										<div>
											<span>Subscription</span>
											<ToneBadge
												tone={subscriptionBadgeTone(organization.subscription.subscriptionStatus)}
											>
												{organization.subscription.subscriptionStatus}
											</ToneBadge>
										</div>
										<div>
											<span>Main contact</span>
											<strong>{organization.contact.mainContactEmail ?? 'No main contact'}</strong>
										</div>
									</div>
								</div>
								<RecordActions>
									<Button asChild variant="secondary">
										<Link
											to="/organizations/$organizationId/users"
											params={{ organizationId: organization.id }}
										>
											Users
										</Link>
									</Button>
								</RecordActions>
							</article>
						))}
					</div>
				)}
			</Panel>

			<Sheet open={createOpen} onOpenChange={setCreateOpen}>
				<SheetContent className="w-[min(520px,100vw)] overflow-auto sm:max-w-none">
					<SheetHeader className="px-5 pt-5">
						<SheetTitle>New organization</SheetTitle>
						<SheetDescription>
							Add the customer organization first, then manage its users from the organization list.
						</SheetDescription>
					</SheetHeader>

					<form className="grid gap-5 px-5 pb-5" onSubmit={submit}>
						<FormGrid>
							<Field>
								<FieldLabel>Agency name</FieldLabel>
								<Input
									required
									value={form.name}
									onChange={(event) => setForm({ ...form, name: event.target.value })}
								/>
							</Field>
							<Field>
								<FieldLabel>Subscription</FieldLabel>
								<NativeSelect
									value={form.subscriptionStatus}
									onChange={(event) =>
										setForm({
											...form,
											subscriptionStatus: event.target
												.value as AdminAgency['subscription']['subscriptionStatus'],
										})
									}
								>
									<option value="trial">trial</option>
									<option value="active">active</option>
									<option value="suspended">suspended</option>
									<option value="canceled">canceled</option>
								</NativeSelect>
							</Field>
							<Field>
								<FieldLabel>Main contact email</FieldLabel>
								<Input
									type="email"
									value={form.mainContactEmail}
									onChange={(event) => setForm({ ...form, mainContactEmail: event.target.value })}
								/>
							</Field>
							<Field>
								<FieldLabel>Phone</FieldLabel>
								<Input
									value={form.phoneNumber}
									onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
								/>
							</Field>
							<Field>
								<FieldLabel>Billing contact</FieldLabel>
								<Input
									value={form.billingContactName}
									onChange={(event) => setForm({ ...form, billingContactName: event.target.value })}
								/>
							</Field>
							<Field>
								<FieldLabel>Billing email</FieldLabel>
								<Input
									type="email"
									value={form.billingContactEmail}
									onChange={(event) =>
										setForm({ ...form, billingContactEmail: event.target.value })
									}
								/>
							</Field>
							<Field className="md:col-span-full">
								<FieldLabel>Notes</FieldLabel>
								<Textarea
									rows={3}
									value={form.subscriptionNotes}
									onChange={(event) => setForm({ ...form, subscriptionNotes: event.target.value })}
								/>
							</Field>
							<Field className="md:col-span-full" orientation="horizontal">
								<Checkbox
									checked={form.linkRequesterAsOwner}
									onCheckedChange={(checked) =>
										setForm({ ...form, linkRequesterAsOwner: checked === true })
									}
								/>
								<FieldLabel>Link me as owner</FieldLabel>
							</Field>
						</FormGrid>
						<SheetFooter className="p-0">
							<FormActions>
								<SheetClose asChild>
									<Button type="button" variant="outline">
										Cancel
									</Button>
								</SheetClose>
								<Button type="submit">Create organization</Button>
							</FormActions>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</PageShell>
	);
}

function subscriptionBadgeTone(status: AdminAgency['subscription']['subscriptionStatus']): Tone {
	if (status === 'active') {
		return 'success';
	}
	if (status === 'trial') {
		return 'info';
	}
	if (status === 'suspended') {
		return 'warning';
	}
	return 'danger';
}

function emptyOrganizationForm(): CreateAdminAgencyInput {
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
