import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ChevronRightIcon, iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	contactDisplayName,
	contactSecondaryLine,
} from '../../../components/public-engagement/public-engagement-display';
import { WriteOnly } from '../../../components/write-only';
import {
	type ContactListing,
	useContactDirectory,
} from '../../../hooks/queries/use-contact-directory';
import { recordNoun } from '../../../lib/record-nouns';

export const Route = createFileRoute('/public-engagement/contacts/')({
	component: ContactsExplorerRoute,
});

const ContactIcon = iconRegistry.entities.organization.icon;
const PAGE_SIZE = 25;

/** The contacts the search matches. Every text field on the row is searched. */
function contactMatches<
	TContact extends {
		readonly contactName: string | null;
		readonly company: string | null;
		readonly department: string | null;
		readonly title: string | null;
		readonly email: string | null;
		readonly preferredPhone: string | null;
		readonly alternatePhone: string | null;
	},
>(contacts: readonly TContact[], search: string): readonly TContact[] {
	const query = search.trim().toLowerCase();
	if (query.length === 0) {
		return contacts;
	}
	const digits = phoneDigits(query);
	return contacts.filter(
		(contact) =>
			[
				contact.contactName,
				contact.company,
				contact.department,
				contact.title,
				contact.email,
				contact.preferredPhone,
				contact.alternatePhone,
			].some((part) => (part ?? '').toLowerCase().includes(query)) ||
			(digits !== null &&
				[contact.preferredPhone, contact.alternatePhone].some((phone) =>
					(phone ?? '').replace(/\D/g, '').includes(digits),
				)),
	);
}

/**
 * The digits of a search that reads as part of a phone number, or null.
 *
 * A number is drawn as `(555) 123-4567` whatever spelling it was stored under,
 * so a person searching for what they see has to find `555.123.4567` too. A
 * search of punctuation alone has no digits and would match every number.
 */
function phoneDigits(query: string): string | null {
	if (!/^[\d\s().+-]+$/.test(query)) {
		return null;
	}
	const digits = query.replace(/\D/g, '');
	return digits.length === 0 ? null : digits;
}

function ContactsExplorerRoute() {
	const { contacts, isReady } = useContactDirectory();

	const [search, setSearch] = useState('');
	// The page is held beside the search it was turned under, so a new search
	// reads as the first page, and it is clamped on read, so a list that shrinks
	// under the current page draws the new last page in the same render.
	const [held, setHeld] = useState({ search, page: 0 });
	const setPage = (page: number) => setHeld({ search, page });

	const filtered = contactMatches(contacts, search);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const page = Math.min(held.search === search ? held.page : 0, pageCount - 1);
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	// `record` is the measure the route-loading skeleton reserves, so the index
	// arrives at the width it stood in for (#1043, #1047).
	return (
		<OutletSimpleLayout measure="record">
			<div className="grid gap-4">
				<PageHeader
					actions={
						<WriteOnly minimum="manager">
							<Button asChild size="sm">
								<Link to="/public-engagement/contacts/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									Create
								</Link>
							</Button>
						</WriteOnly>
					}
					title={recordNoun('contact').titleMany}
				/>

				<SearchInput
					className="max-w-md"
					label="Search contacts"
					onChange={(event) => setSearch(event.target.value)}
					onClear={() => setSearch('')}
					placeholder="Search contacts…"
					value={search}
				/>

				{!isReady ? (
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
								noun={recordNoun('contact')}
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

function ContactRowItem({ contact }: { readonly contact: ContactListing }) {
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
