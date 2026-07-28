import type { ContactRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ChevronRightIcon,
	iconRegistry,
	PlusIcon,
	SearchIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { contactDisplayName, contactSecondaryLine } from '../-public-engagement-display';

export const Route = createFileRoute('/public-engagement/contacts/')({
	component: ContactsExplorerRoute,
});

const ContactIcon = iconRegistry.entities.organization.icon;
const contactsGcTimeMs = 30_000;
const PAGE_SIZE = 25;

function ContactsExplorerRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	// contacts is on-demand; the org-scoped query drives its subset. Status-gated
	// useLiveQuery (not the suspense variant) avoids the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: contactsGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.organizationId, organizationId))
					.orderBy(({ contact }) => contact.contactName, 'asc'),
		},
		[organizationId],
	);
	const contacts = (result.data ?? []) as readonly ContactRow[];

	const [search, setSearch] = useState('');
	const [page, setPage] = useState(0);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (query.length === 0) {
			return contacts;
		}
		return contacts.filter((contact) =>
			[
				contact.contactName,
				contact.company,
				contact.department,
				contact.title,
				contact.email,
				contact.preferredPhone,
				contact.alternatePhone,
			].some((part) => (part ?? '').toLowerCase().includes(query)),
		);
	}, [contacts, search]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset to the first page on a new search.
	useEffect(() => {
		setPage(0);
	}, [search]);
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	return (
		<OutletSimpleLayout>
			<div className="grid gap-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">Contacts</h1>
						<p className="m-0 text-muted-foreground text-sm">
							People and organizations the agency engages with on service requests and
							notifications.
						</p>
					</div>
					<Button asChild size="sm">
						<Link to="/public-engagement/contacts/create">
							<PlusIcon aria-hidden="true" data-icon="inline-start" />
							Create
						</Link>
					</Button>
				</div>

				<div className="relative max-w-md">
					<SearchIcon
						aria-hidden="true"
						className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
					/>
					<Input
						aria-label="Search contacts"
						className="pl-9"
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search contacts…"
						type="search"
						value={search}
					/>
				</div>

				{!result.isReady ? (
					<ContactsSkeleton />
				) : filtered.length === 0 ? (
					<ContactsEmpty hasSearch={search.trim().length > 0} />
				) : (
					<div className="grid gap-3">
						<ul className="grid gap-1 rounded-md border border-border/40 p-2">
							{visible.map((contact) => (
								<ContactRowItem contact={contact} key={contact.id} />
							))}
						</ul>
						{pageCount > 1 ? (
							<ExplorerPagination
								noun="contacts"
								onPageChange={setPage}
								page={page}
								pageCount={pageCount}
								total={filtered.length}
							/>
						) : null}
					</div>
				)}
			</div>
		</OutletSimpleLayout>
	);
}

function ContactRowItem({ contact }: { readonly contact: ContactRow }) {
	const secondary = contactSecondaryLine(contact);
	return (
		<li className="group">
			<Link
				className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: contact.id }}
				to="/public-engagement/contacts/$id"
			>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium text-foreground text-sm group-hover:text-primary">
						{contactDisplayName(contact)}
					</span>
					{secondary === null ? null : (
						<span className="block truncate text-muted-foreground text-xs">{secondary}</span>
					)}
				</span>
				<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
			</Link>
		</li>
	);
}

function ContactsSkeleton() {
	return (
		<div className="grid gap-2 rounded-md border border-border/40 p-2">
			{[0, 1, 2, 3, 4].map((index) => (
				<Skeleton className="h-11" key={index} />
			))}
		</div>
	);
}

function ContactsEmpty({ hasSearch }: { readonly hasSearch: boolean }) {
	return (
		<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ContactIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{hasSearch ? 'No Contacts Match' : 'No Contacts Yet'}</EmptyTitle>
				<EmptyDescription>
					{hasSearch
						? 'Try a different search term.'
						: 'Create a contact to start tracking the people and organizations you engage with.'}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
