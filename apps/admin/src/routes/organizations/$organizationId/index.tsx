import { ListLoading } from '@simmer-mosquito/ui-web/components/page';
import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { AdminOrganization } from '../../../api';
import { AdminError, AdminPage } from '../../../components/admin-page';
import { subscriptionTone } from '../../../lib/tones';
import { useOrganizations } from '../-organization-data';

const OrganizationIcon = iconRegistry.entities.organization.icon;
const ContactIcon = iconRegistry.entities.contact.icon;
const SettingsIcon = iconRegistry.generic.settings.icon;

export const Route = createFileRoute('/organizations/$organizationId/')({
	component: OrganizationDetailRoute,
});

function OrganizationDetailRoute() {
	const { organizationId } = Route.useParams();
	const { data, isPending, error } = useOrganizations();
	const organization = (data ?? []).find((row) => row.id === organizationId);

	if (error !== null) {
		return (
			<AdminPage icon={OrganizationIcon} title="Agency">
				<AdminError error={error} />
			</AdminPage>
		);
	}

	if (isPending) {
		return (
			<AdminPage icon={OrganizationIcon} title="Agency">
				<ListLoading rows={3} />
			</AdminPage>
		);
	}

	if (organization === undefined) {
		return (
			<AdminPage
				description="This agency is not on the platform."
				icon={OrganizationIcon}
				title="Agency Not Found"
			>
				<Button asChild variant="outline">
					<Link to="/organizations">Back to agencies</Link>
				</Button>
			</AdminPage>
		);
	}

	return (
		<AdminPage
			actions={
				<>
					<Button asChild variant="outline">
						<Link params={{ organizationId }} to="/organizations/$organizationId/members">
							Members
						</Link>
					</Button>
					<Button asChild>
						<Link params={{ organizationId }} to="/organizations/$organizationId/foundations">
							Foundations
						</Link>
					</Button>
				</>
			}
			description="Support metadata for this agency. Operational records belong to the agency and live in the SIMMER web app."
			icon={OrganizationIcon}
			title={organization.name}
		>
			<div className="grid gap-5 lg:grid-cols-2">
				<Panel icon={<OrganizationIcon aria-hidden="true" />} title="Identity">
					<FactList
						facts={[
							{ label: 'Agency id', value: organization.id, mono: true },
							{
								label: 'WorkOS organization',
								value: organization.workosOrganizationId,
								mono: true,
								/*
								 * Without this link nobody in the agency can sign in, so an
								 * absent value is a blocking condition rather than a blank —
								 * it says so instead of rendering an em dash.
								 */
								missing: 'Not linked — nobody can sign in yet',
							},
							{ label: 'Slug', value: organization.slug, mono: true },
							{ label: 'Owner linked', value: organization.ownerLinked ? 'Yes' : 'No' },
							{ label: 'Created', value: formatDate(organization.createdAt) },
							{ label: 'Updated', value: formatDate(organization.updatedAt) },
						]}
					/>
				</Panel>

				<Panel icon={<SettingsIcon aria-hidden="true" />} title="Subscription">
					<div className="px-4 pt-4">
						<Badge
							className="capitalize"
							tone={subscriptionTone(organization.subscription.subscriptionStatus)}
							variant="outline"
						>
							{organization.subscription.subscriptionStatus}
						</Badge>
					</div>
					<FactList
						facts={[
							{
								label: 'Billing mode',
								value: organization.subscription.billingMode.replace(/_/g, ' '),
							},
							{ label: 'Billing contact', value: organization.subscription.billingContactName },
							{ label: 'Billing email', value: organization.subscription.billingContactEmail },
							{ label: 'Notes', value: organization.subscription.subscriptionNotes },
						]}
					/>
				</Panel>

				<Panel className="lg:col-span-2" icon={<ContactIcon aria-hidden="true" />} title="Contact">
					<FactList
						facts={[
							{ label: 'Main contact email', value: organization.contact.mainContactEmail },
							{ label: 'Phone', value: organization.contact.phoneNumber },
							{ label: 'Address', value: mailingAddress(organization) },
						]}
					/>
				</Panel>
			</div>
		</AdminPage>
	);
}

interface Fact {
	readonly label: string;
	readonly value: string | null;
	readonly mono?: boolean;
	/** Shown instead of the neutral placeholder when absence is worth naming. */
	readonly missing?: string;
}

function FactList({ facts }: { readonly facts: readonly Fact[] }) {
	return (
		<dl className="m-0 grid gap-px bg-border/60 p-4 [&>div]:bg-card">
			{facts.map((fact) => (
				<div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-4 py-2" key={fact.label}>
					<dt className="m-0 text-muted-foreground text-sm">{fact.label}</dt>
					<dd
						className={`m-0 [overflow-wrap:anywhere] text-sm ${
							fact.value === null || fact.value === ''
								? 'text-muted-foreground'
								: fact.mono === true
									? 'font-mono text-foreground text-xs'
									: 'text-foreground'
						}`}
					>
						{fact.value === null || fact.value === '' ? (fact.missing ?? '—') : fact.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function mailingAddress(organization: AdminOrganization): string | null {
	const parts = [
		organization.contact.mailingAddressLine1,
		organization.contact.mailingAddressLine2,
		organization.contact.mailingLocality,
		organization.contact.mailingRegion,
		organization.contact.mailingPostalCode,
		organization.contact.mailingCountry,
	].filter((part): part is string => part !== null && part.trim() !== '');

	return parts.length === 0 ? null : parts.join(', ');
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? iso
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
