import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import {
	createItems,
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import type { Contact } from '../../../hooks/queries/contact-view';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { useContactServiceRequests } from '../../../hooks/queries/use-contact-service-requests';
import { recordNoun } from '../../../lib/record-nouns';
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
const CoverageIcon = iconRegistry.generic.map.icon;
const RequestIcon = iconRegistry.entities.serviceRequest.icon;

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { main: [['h-40', 'h-40'], 'h-56'], aside: ['h-72'] },
};

function ContactDetailRoute() {
	const { id } = Route.useParams();
	const { contact, isError, isReady } = useContact(id);

	return (
		<RecordDetailPage
			layout={layout}
			recordType="contact"
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
		<DetailPageShell
			aside={
				<CommentsSection
					description="Notes and follow-up for this contact."
					target={{ type: 'contact', id: contact.id }}
				/>
			}
			facts={
				<Card variant="surface">
					<CardHeader padding="compact">
						<CardTitle>Communication</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4" padding="compact">
						<DetailList>
							<DetailRow label="Preferred">{contact.preferredPhone}</DetailRow>
							<DetailRow label="Alternate">{contact.alternatePhone}</DetailRow>
							<DetailRow label="Email">{mailtoLink(contact.email)}</DetailRow>
						</DetailList>
						<div className="flex flex-wrap gap-1.5">
							<PreferenceBadge active={contact.wantsEmail} label="Email" />
							<PreferenceBadge active={contact.wantsSms} label="SMS" />
							<PreferenceBadge active={contact.wantsPhone} label="Phone" />
						</div>
					</CardContent>
				</Card>
			}
			header={{
				/*
				 * A registration is always somebody's, so this is the way in. There is
				 * no organization-wide registrations page to reach them from any more,
				 * and arriving from the contact answers the one question a standalone
				 * create page had to ask first.
				 */
				actions: [
					...createItems('contactId', contact.id, ['/public-engagement/service-requests/create']),
					{
						icon: CoverageIcon,
						id: 'registrations',
						label: 'Manage registrations',
						params: { id: contact.id },
						separatorBefore: true,
						to: '/public-engagement/contacts/$id/registrations',
					},
				],
				edit: {
					minimum: 'manager',
					params: { id: contact.id },
					to: '/public-engagement/contacts/$id/edit',
				},
				icon: ContactIcon,
				remove: {
					name: name,
					onDelete: () => mutations.remove(contact.id),
					recordId: contact.id,
					recordType: 'contact',
					returnTo: '/public-engagement/contacts',
				},
				subtitle:
					contact.title === null && contact.company === null
						? undefined
						: [contact.title, contact.company].filter(Boolean).join(' · '),
				recordType: 'Contact',
				tags: { recordId: contact.id },
				title: name,
			}}
			layout={layout}
			lead={
				<Card variant="surface">
					<CardHeader padding="compact">
						<CardTitle>Identity</CardTitle>
					</CardHeader>
					<CardContent padding="compact">
						<DetailList>
							<DetailRow label="Name">{contact.contactName}</DetailRow>
							<DetailRow label="Company">{contact.company}</DetailRow>
							<DetailRow label="Department">{contact.department}</DetailRow>
							<DetailRow label="Title">{contact.title}</DetailRow>
						</DetailList>
					</CardContent>
				</Card>
			}
		>
			<ContactServiceRequestsCard contactId={contact.id} />
		</DetailPageShell>
	);
}

function ContactServiceRequestsCard({ contactId }: { readonly contactId: string }) {
	const { requests, isReady, isError } = useContactServiceRequests(contactId);

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>{recordNoun('serviceRequest').titleMany}</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				<PanelRows
					empty={{
						description: 'No service requests are linked to this contact.',
						title: 'No Service Requests',
					}}
					icon={<RequestIcon aria-hidden="true" />}
					reading={{ isError, isReady, rows: requests }}
					unavailable={{
						description: 'Service request records could not be loaded. Try again shortly.',
						title: 'Service Requests Unavailable',
					}}
				>
					{(rows) =>
						rows.map((request) => (
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
						))
					}
				</PanelRows>
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

/** The address as a link that opens a mail client, or nothing for the row to report. */
function mailtoLink(email: string | null): ReactNode {
	const trimmed = email?.trim() ?? '';
	if (trimmed.length === 0) {
		return null;
	}
	return (
		<a className={recordLink({ tone: 'inherit', underline: 'hover' })} href={`mailto:${trimmed}`}>
			{trimmed}
		</a>
	);
}
