import type { LinkedRecordFamily } from '@simmer-mosquito/domain';
import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { useState } from 'react';
import { useActivityLookups } from '../../../hooks/activity/use-activity-lookups';
import { useAddressLinkedRecords } from '../../../hooks/gis/use-address-linked-records';
import { useOrganizationClock } from '../../../hooks/use-organization-clock';
import type { OrganizationClock } from '../../../lib/organization-clock';
import type { ActivityLookups } from '../../activity/activity-data';
import { ExplorerRow } from '../../explorer';
import { LabelCount } from '../../label-count';
import { recordBadges, StateBadge } from '../../record/record-badges';
import {
	LINKED_FAMILY_LABEL,
	type LinkedRecordFamilyPage,
	type LinkedRecordItem,
	type LinkedRecordsRead,
	linkedRecordKey,
	linkedRecordRow,
	linkedRecordsCaption,
} from './address-linked-records';

/**
 * The records whose Linked Address is this Address, below what is sited
 * there: one tab per family that has any, each its newest records and its
 * total, drawn as the service request page's nearby rows. Takes the Address
 * id; a row leaves out a place that came from the Address, because the page
 * heading shows it.
 */
export function AddressLinkedRecordsCard({ addressId }: { readonly addressId: string }) {
	const read = useAddressLinkedRecords(addressId);
	const lookups = useActivityLookups();
	const clock = useOrganizationClock();

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Linked Records</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				<LinkedRecordsBody clock={clock} lookups={lookups} read={read} />
			</CardContent>
		</Card>
	);
}

/** The card's body: its loading, failed and empty states, or the family tabs. */
export function LinkedRecordsBody({
	read,
	lookups,
	clock,
}: {
	readonly read: LinkedRecordsRead;
	readonly lookups: ActivityLookups;
	readonly clock: OrganizationClock;
}) {
	const [selected, setSelected] = useState<LinkedRecordFamily | null>(null);

	if (read.data === undefined) {
		if (read.isError) {
			return (
				<div className="flex flex-wrap items-center gap-2 px-1 py-2" role="alert">
					<CardMessage>Linked records could not be loaded.</CardMessage>
					<Button onClick={() => void read.refetch()} size="sm" variant="outline">
						Try Again
					</Button>
				</div>
			);
		}
		return (
			<div className="grid gap-px">
				<Skeleton className="h-[60px]" />
				<Skeleton className="h-[60px]" />
			</div>
		);
	}

	// A family with nothing in it gets no tab: the strip names what is there.
	const pages = read.data.families.filter((page) => page.total > 0);
	const first = pages[0];
	if (first === undefined) {
		return <CardMessage>No records name this address.</CardMessage>;
	}
	const active = pages.find((page) => page.family === selected)?.family ?? first.family;

	return (
		<Tabs
			className="gap-0"
			onValueChange={(value) => {
				const page = pages.find((entry) => entry.family === value);
				if (page !== undefined) {
					setSelected(page.family);
				}
			}}
			value={active}
		>
			<TabStrip aria-label="Linked record families">
				{pages.map((page) => (
					<TabStripTab key={page.family} value={page.family}>
						{LINKED_FAMILY_LABEL[page.family]}
						<LabelCount count={page.total} />
					</TabStripTab>
				))}
			</TabStrip>
			{pages.map((page) => (
				<TabsContent key={page.family} value={page.family}>
					<LinkedFamilyList clock={clock} lookups={lookups} page={page} />
				</TabsContent>
			))}
		</Tabs>
	);
}

/** One family: what the tab is showing, then its rows, newest first. */
function LinkedFamilyList({
	page,
	lookups,
	clock,
}: {
	readonly page: LinkedRecordFamilyPage;
	readonly lookups: ActivityLookups;
	readonly clock: OrganizationClock;
}) {
	return (
		<>
			<p className="m-0 border-border/40 border-b px-1 py-2 text-muted-foreground text-xs">
				{linkedRecordsCaption(page)}
			</p>
			<ul className="m-0 list-none p-0">
				{page.items.map((item, index) => (
					<li
						className={index === 0 ? undefined : 'border-border/40 border-t'}
						key={linkedRecordKey(item)}
					>
						<LinkedRecordExplorerRow clock={clock} item={item} lookups={lookups} />
					</li>
				))}
			</ul>
		</>
	);
}

/**
 * One linked record as `ExplorerRow` draws it: the date, the title, the
 * subtitle, the state as a pill, the Tags and the chevron. There is no map on
 * this page, so the row selects nothing and draws no dot.
 */
function LinkedRecordExplorerRow({
	item,
	lookups,
	clock,
}: {
	readonly item: LinkedRecordItem;
	readonly lookups: ActivityLookups;
	readonly clock: OrganizationClock;
}) {
	const row = linkedRecordRow(item, lookups, clock);
	return (
		<ExplorerRow
			badges={
				row.badge.kind === 'facts' ? (
					recordBadges(row.badge.facts, 'badge')
				) : (
					<StateBadge token={row.badge.token} />
				)
			}
			date={row.date}
			detailLabel={`View details for ${row.title}`}
			detailLink={row.link}
			isSelected={false}
			selectLabel={row.title}
			subtitle={row.subtitle}
			tags={row.tags}
			title={row.title}
			titleLink={row.link}
		/>
	);
}

function CardMessage({ children }: { readonly children: string }) {
	return <p className="m-0 px-1 py-2 text-muted-foreground text-sm">{children}</p>;
}
