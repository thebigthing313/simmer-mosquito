import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { RecordUnavailable } from '../../../components/record';
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

function ContactDetailRoute() {
	const { id } = Route.useParams();
	const { contact, isReady } = useContact(id);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link className={backLink()} to="/public-engagement/contacts">
					<ArrowLeftIcon aria-hidden="true" />
					Back to Contacts
				</Link>
				{!isReady ? (
					<ContactDetailSkeleton />
				) : contact === undefined ? (
					<RecordUnavailable noun="contact" reason="not-found" />
				) : (
					<ContactDetailContent contact={contact} />
				)}
			</div>
		</div>
	);
}

function ContactDetailContent({ contact }: { readonly contact: Contact }) {
	const name = contactDisplayName(contact);
	useBreadcrumbLabel(contact.id, name);
	const mutations = useContactMutations();

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<ContactIcon aria-hidden="true" className="size-3.5" />
						Contact
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">{name}</h1>
					{contact.title !== null || contact.company !== null ? (
						<p className="m-0 text-[0.95rem] text-muted-foreground">
							{[contact.title, contact.company].filter(Boolean).join(' · ')}
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{/*
					 * A registration is always somebody's, so this is the way in. There is
					 * no agency-wide registrations page to reach them from any more, and
					 * arriving from the contact answers the one question a standalone
					 * create page had to ask first.
					 */}
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: contact.id }} to="/public-engagement/contacts/$id/registrations">
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
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
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
				</div>

				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<CommentsSection
						description="Notes and follow-up for this contact."
						target={{ type: 'contact', id: contact.id }}
					/>
				</div>
			</div>
		</>
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

function ContactDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-40" />
					<Skeleton className="h-40" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}
