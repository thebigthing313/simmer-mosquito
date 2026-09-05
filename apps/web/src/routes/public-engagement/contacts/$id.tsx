import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import {
	RecordDetailColumns,
	RecordDetailHeader,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import type { Contact } from '../../../hooks/queries/contact-view';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { useContactServiceRequests } from '../../../hooks/queries/use-contact-service-requests';
import {
	contactDisplayName,
	formatRequestDate,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../-public-engagement-display';
import { RequestStatusBadge } from '../-public-engagement-ui';

export const Route = createFileRoute('/public-engagement/contacts/$id')({
	component: ContactDetailRoute,
});

const ContactIcon = iconRegistry.entities.organization.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const CoverageIcon = iconRegistry.generic.map.icon;

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { eyebrow: 'w-20', main: ['h-40', 'h-40'], aside: ['h-72'] },
};

function ContactDetailRoute() {
	const { id } = Route.useParams();
	const { contact, isError, isReady } = useContact(id);

	return (
		<RecordDetailPage
			back={{ label: 'Back to Contacts', to: '/public-engagement/contacts' }}
			layout={layout}
			noun="contact"
			reading={{ isError, isReady, record: contact }}
		>
			{(record) => <ContactDetailContent contact={record} />}
		</RecordDetailPage>
	);
}

function ContactDetailContent({ contact }: { readonly contact: Contact }) {
	const name = contactDisplayName(contact);
	useBreadcrumbLabel(contact.id, name);
	const mutations = useContactMutations();

	return (
		<RecordDetailColumns
			aside={
				<CommentsSection
					description="Notes and follow-up for this contact."
					target={{ type: 'contact', id: contact.id }}
				/>
			}
			header={
				<RecordDetailHeader
					actions={
						<>
							{/*
							 * A registration is always somebody's, so this is the way in. There is
							 * no organization-wide registrations page to reach them from any more,
							 * and arriving from the contact answers the one question a standalone
							 * create page had to ask first.
							 */}
							<Button asChild size="sm" variant="outline">
								<Link
									params={{ id: contact.id }}
									to="/public-engagement/contacts/$id/registrations"
								>
									<CoverageIcon aria-hidden="true" />
									Manage registrations
								</Link>
							</Button>
							<WriteOnly minimum="manager">
								<Button asChild size="sm" variant="outline">
									<Link params={{ id: contact.id }} to="/public-engagement/contacts/$id/edit">
										<EditIcon aria-hidden="true" />
										Edit
									</Link>
								</Button>
							</WriteOnly>
						</>
					}
					eyebrow="Contact"
					icon={ContactIcon}
					title={name}
					{...(contact.title === null && contact.company === null
						? {}
						: { subtitle: [contact.title, contact.company].filter(Boolean).join(' · ') })}
				/>
			}
			layout={layout}
		>
			<Card variant="surface">
				<CardHeader className="px-4 py-4">
					<CardTitle>Identity</CardTitle>
				</CardHeader>
				<CardContent padding="compact">
					<dl className="grid gap-2.5">
						<DetailRow label="Name">{orNotSet(contact.contactName)}</DetailRow>
						<DetailRow label="Company">{orNotSet(contact.company)}</DetailRow>
						<DetailRow label="Department">{orNotSet(contact.department)}</DetailRow>
						<DetailRow label="Title">{orNotSet(contact.title)}</DetailRow>
					</dl>
				</CardContent>
			</Card>

			<Card variant="surface">
				<CardHeader className="px-4 py-4">
					<CardTitle>Communication</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4" padding="compact">
					<dl className="grid gap-2.5">
						<DetailRow label="Preferred">{orNotSet(contact.preferredPhone)}</DetailRow>
						<DetailRow label="Alternate">{orNotSet(contact.alternatePhone)}</DetailRow>
						<DetailRow label="Email">{emailOrNotSet(contact.email)}</DetailRow>
					</dl>
					<div className="flex flex-wrap gap-1.5">
						<PreferenceBadge active={contact.wantsEmail} label="Email" />
						<PreferenceBadge active={contact.wantsSms} label="SMS" />
						<PreferenceBadge active={contact.wantsPhone} label="Phone" />
					</div>
				</CardContent>
			</Card>

			<ContactServiceRequestsCard contactId={contact.id} />

			<DangerZoneCard
				name={name}
				noun="contact"
				onDelete={() => mutations.remove(contact.id)}
				recordId={contact.id}
				recordType="contact"
				returnTo="/public-engagement/contacts"
			/>
		</RecordDetailColumns>
	);
}

function ContactServiceRequestsCard({ contactId }: { readonly contactId: string }) {
	const { requests, isReady, isError } = useContactServiceRequests(contactId);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Service Requests</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				{isError ? (
					<CardMessage>Service requests could not be loaded.</CardMessage>
				) : !isReady ? (
					<div className="grid gap-2">
						{[0, 1].map((index) => (
							<Skeleton className="h-12 w-full" key={index} />
						))}
					</div>
				) : requests.length === 0 ? (
					<CardMessage>No service requests are linked to this contact.</CardMessage>
				) : (
					<ul className="grid gap-1">
						{requests.map((request) => (
							<li key={request.id}>
								<Link
									className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									params={{ id: request.id }}
									to="/public-engagement/service-requests/$id"
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-foreground text-sm">
											{serviceRequestTitle(request)}
										</span>
										<span className="block truncate text-muted-foreground text-xs">
											{formatRequestDate(request.requestDate)}
										</span>
									</span>
									<RequestStatusBadge open={isServiceRequestOpen(request)} />
								</Link>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function PreferenceBadge({ active, label }: { readonly active: boolean; readonly label: string }) {
	return active ? (
		<Badge tone="success" variant="outline">
			{`Wants ${label}`}
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			{`No ${label}`}
		</Badge>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[90px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function CardMessage({ children }: { readonly children: ReactNode }) {
	return <p className="m-0 px-1 py-4 text-center text-muted-foreground text-sm">{children}</p>;
}

function orNotSet(value: string | null): ReactNode {
	return value === null || value.trim().length === 0 ? (
		<span className="text-muted-foreground">Not set</span>
	) : (
		value
	);
}

function emailOrNotSet(email: string | null): ReactNode {
	const trimmed = email?.trim() ?? '';
	if (trimmed.length === 0) {
		return <span className="text-muted-foreground">Not set</span>;
	}
	return (
		<a
			className="rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`mailto:${trimmed}`}
		>
			{trimmed}
		</a>
	);
}
