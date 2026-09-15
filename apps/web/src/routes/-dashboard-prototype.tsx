/**
 * PROTOTYPE. Three variants of the Dashboard on static data, switchable via
 * `?variant=` on the existing `/` route (#981).
 *
 * The question: does the queue panel want one column or two, does the count
 * strip read at a glance with eight types, and what each panel and row is
 * called. Nothing here reads a collection. The winner is rewritten, not moved.
 */

import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel, PanelMessage } from '@simmer-mosquito/ui-web/components/panel';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
	ACTIVITY,
	type ActivityType,
	ageLabel,
	deltaOf,
	FLAGS,
	PEOPLE,
	type PersonToday,
	QUEUES,
	type QueueRow,
	TODAY,
	WINDOW,
} from './-dashboard-prototype-data';

const HomeIcon = iconRegistry.generic.home.icon;
const QueueIcon = iconRegistry.generic.history.icon;
const FlagIcon = iconRegistry.actions.warning.icon;
const ActivityIcon = iconRegistry.generic.chart.icon;
const PeopleIcon = iconRegistry.entities.contact.icon;

export const DASHBOARD_VARIANTS = [
	{ key: 'A', name: 'Stacked panels' },
	{ key: 'B', name: 'Two-up by domain' },
	{ key: 'C', name: 'Ledger' },
] as const;

export type DashboardVariantKey = (typeof DASHBOARD_VARIANTS)[number]['key'];

const WINDOW_LABEL = '9 to 15 Sep';

function DeltaBadge({ type }: { readonly type: ActivityType }) {
	const delta = deltaOf(type);
	if (delta === null) return null;
	if (delta === 0) {
		return (
			<Badge tone="neutral" variant="outline">
				same
			</Badge>
		);
	}
	return (
		<Badge tone={delta > 0 ? 'info' : 'warning'} variant="outline">
			{delta > 0 ? `+${delta}` : `${delta}`}
		</Badge>
	);
}

function PersonLink({
	person,
	children,
}: {
	readonly person: PersonToday;
	readonly children: ReactNode;
}) {
	return (
		<Link
			className="font-medium text-foreground text-sm hover:underline"
			params={{ profileId: person.profileId }}
			search={{ date: TODAY }}
			to="/daily-work/$profileId"
		>
			{children}
		</Link>
	);
}

function splitLabel(row: QueueRow): string {
	return row.split
		? `${row.split.count} ${row.split.label} · ${row.count - row.split.count} ${row.split.rest}`
		: '';
}

// --- A: stacked panels ------------------------------------------------------

function QueueLine({ row, tone }: { readonly row: QueueRow; readonly tone?: 'warning' }) {
	const empty = row.count === 0;
	return (
		<li>
			<Link
				className={cn(
					'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40',
					empty && 'text-muted-foreground',
				)}
				to={row.to}
			>
				<span
					className={cn(
						'w-14 shrink-0 text-right font-semibold text-2xl tabular-nums leading-none',
						tone === 'warning' && !empty && 'text-[var(--warning)]',
					)}
				>
					{row.count}
				</span>
				<span className="grid min-w-0 flex-1">
					<span className="truncate font-medium text-sm">{row.label}</span>
					<span className="truncate text-muted-foreground text-xs">
						{row.split ? splitLabel(row) : row.what}
					</span>
				</span>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{empty ? 'none' : `oldest ${ageLabel(row.oldestDays)}`}
				</span>
				<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
			</Link>
		</li>
	);
}

function ActivityTile({ type }: { readonly type: ActivityType }) {
	return (
		<div className="grid gap-1 rounded-md border border-border/60 p-3">
			<span className="text-muted-foreground text-xs">{type.label}</span>
			<span className="flex items-baseline gap-2">
				<span className="font-semibold text-2xl tabular-nums leading-none">{type.count}</span>
				<DeltaBadge type={type} />
			</span>
		</div>
	);
}

export function VariantA() {
	const shown = ACTIVITY.filter((type) => type.count !== null);
	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<PageHeader
				description="What is pending, what needs attention, and what was logged this week."
				eyebrow="Organization"
				icon={HomeIcon}
				title="Dashboard"
			/>
			<Panel
				count={QUEUES.reduce((sum, row) => sum + row.count, 0)}
				icon={<QueueIcon className="size-4" />}
				title="Pending"
			>
				<ul className="m-0 list-none divide-y divide-border/60 p-0">
					{QUEUES.map((row) => (
						<QueueLine key={row.key} row={row} />
					))}
				</ul>
			</Panel>
			<Panel icon={<FlagIcon className="size-4" />} title="Needs Attention">
				<ul className="m-0 list-none divide-y divide-border/60 p-0">
					{FLAGS.map((row) => (
						<QueueLine key={row.key} row={row} tone="warning" />
					))}
				</ul>
			</Panel>
			<Panel
				actions={
					<span className="text-muted-foreground text-xs">
						{WINDOW_LABEL}, against the 7 days before
					</span>
				}
				icon={<ActivityIcon className="size-4" />}
				title="This Week"
			>
				<div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
					{shown.map((type) => (
						<ActivityTile key={type.key} type={type} />
					))}
				</div>
			</Panel>
			<Panel count={PEOPLE.length} icon={<PeopleIcon className="size-4" />} title="People Today">
				{PEOPLE.length === 0 ? (
					<PanelMessage>Nothing logged yet today.</PanelMessage>
				) : (
					<ul className="m-0 list-none divide-y divide-border/60 p-0">
						{PEOPLE.map((person) => (
							<li className="flex items-center gap-3 px-4 py-2.5" key={person.profileId}>
								<span className="grid min-w-0 flex-1">
									<PersonLink person={person}>{person.name}</PersonLink>
									<span className="truncate text-muted-foreground text-xs">
										{person.kinds.join(', ')}
									</span>
								</span>
								<span className="shrink-0 text-sm tabular-nums">{person.records} records</span>
								<span className="w-14 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
									{person.lastAt}
								</span>
							</li>
						))}
					</ul>
				)}
			</Panel>
		</div>
	);
}

// --- B: two-up by domain ------------------------------------------------------

function QueueRowCompact({ row }: { readonly row: QueueRow }) {
	const empty = row.count === 0;
	return (
		<li className={cn('flex items-center gap-3 px-4 py-2', empty && 'text-muted-foreground')}>
			<Link className="min-w-0 flex-1 truncate text-sm hover:underline" to={row.to}>
				{row.label}
			</Link>
			{row.split ? (
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{splitLabel(row)}
				</span>
			) : null}
			<span className="w-20 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
				{empty ? '' : ageLabel(row.oldestDays)}
			</span>
			<span className="w-10 shrink-0 text-right font-semibold text-base tabular-nums">
				{row.count}
			</span>
		</li>
	);
}

function DomainQueuePanel({
	title,
	domain,
}: {
	readonly title: string;
	readonly domain: QueueRow['domain'];
}) {
	const rows = QUEUES.filter((row) => row.domain === domain);
	return (
		<Panel
			count={rows.reduce((sum, row) => sum + row.count, 0)}
			icon={<QueueIcon className="size-4" />}
			title={title}
		>
			<div className="flex items-center gap-3 px-4 py-1.5 text-muted-foreground text-xs">
				<span className="flex-1">Queue</span>
				<span className="w-20 text-right">Oldest</span>
				<span className="w-10 text-right">Count</span>
			</div>
			<ul className="m-0 list-none divide-y divide-border/60 p-0">
				{rows.map((row) => (
					<QueueRowCompact key={row.key} row={row} />
				))}
			</ul>
		</Panel>
	);
}

export function VariantB() {
	const shown = ACTIVITY.filter((type) => type.count !== null);
	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<PageHeader
				description="The state of the Organization, for the person deciding what happens next."
				eyebrow="Organization"
				icon={HomeIcon}
				title="Dashboard"
			/>
			<div className="grid gap-5 xl:grid-cols-2">
				<DomainQueuePanel domain="surveillance" title="Surveillance Backlog" />
				<DomainQueuePanel domain="operations" title="Operations Backlog" />
			</div>
			{FLAGS.map((row) => (
				<Link
					className="flex items-center gap-3 rounded-md border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-4 py-3 hover:bg-[var(--warning-bg)]/70"
					key={row.key}
					to={row.to}
				>
					<FlagIcon aria-hidden="true" className="size-5 shrink-0 text-[var(--warning)]" />
					<span className="min-w-0 flex-1">
						<span className="font-medium text-sm">
							{row.count} {row.label.toLowerCase()}
						</span>
						<span className="block truncate text-muted-foreground text-xs">
							{row.what}; oldest {ageLabel(row.oldestDays)}
						</span>
					</span>
					<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				</Link>
			))}
			<section className="grid gap-2">
				<div className="flex items-baseline justify-between">
					<h2 className="m-0 font-semibold text-foreground text-sm">Last 7 Days</h2>
					<span className="text-muted-foreground text-xs">
						{WINDOW.from} to {WINDOW.to}, delta against the 7 before
					</span>
				</div>
				<div className="grid grid-cols-2 divide-x divide-border/60 overflow-hidden rounded-md border border-border/60 sm:grid-cols-4 xl:grid-cols-7">
					{shown.map((type) => (
						<div className="grid gap-0.5 px-3 py-2.5" key={type.key}>
							<span className="flex items-baseline gap-1.5">
								<span className="font-semibold text-xl tabular-nums leading-none">
									{type.count}
								</span>
								<DeltaBadge type={type} />
							</span>
							<span className="truncate text-muted-foreground text-xs">{type.label}</span>
						</div>
					))}
				</div>
			</section>
			<Panel
				count={PEOPLE.length}
				icon={<PeopleIcon className="size-4" />}
				title="In the Field Today"
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Person</TableHead>
							<TableHead className="text-right">Records</TableHead>
							<TableHead className="text-right">Last record</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{PEOPLE.map((person) => (
							<TableRow key={person.profileId}>
								<TableCell>
									<PersonLink person={person}>{person.name}</PersonLink>
								</TableCell>
								<TableCell className="text-right tabular-nums">{person.records}</TableCell>
								<TableCell className="text-right text-muted-foreground tabular-nums">
									{person.lastAt}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Panel>
		</div>
	);
}

// --- C: ledger ---------------------------------------------------------------

function LedgerHeading({
	children,
	aside,
}: {
	readonly children: string;
	readonly aside?: string;
}) {
	return (
		<div className="flex items-baseline justify-between border-border border-b pb-1.5">
			<h2 className="m-0 font-semibold text-foreground text-sm uppercase tracking-wide">
				{children}
			</h2>
			{aside ? <span className="text-muted-foreground text-xs">{aside}</span> : null}
		</div>
	);
}

function LedgerRow({ row, flag = false }: { readonly row: QueueRow; readonly flag?: boolean }) {
	const empty = row.count === 0;
	return (
		<tr className={cn('border-border/60 border-b', empty && 'text-muted-foreground')}>
			<td className="py-1.5 pr-3">
				<Link className="text-sm hover:underline" to={row.to}>
					{row.label}
				</Link>
				{flag ? <span className="ml-2 text-muted-foreground text-xs">{row.what}</span> : null}
			</td>
			<td className="py-1.5 pr-3 text-right text-muted-foreground text-xs tabular-nums">
				{splitLabel(row)}
			</td>
			<td className="py-1.5 pr-3 text-right text-muted-foreground text-xs tabular-nums">
				{empty ? '' : ageLabel(row.oldestDays)}
			</td>
			<td
				className={cn(
					'w-12 py-1.5 text-right font-semibold text-base tabular-nums',
					flag && !empty && 'text-[var(--warning)]',
				)}
			>
				{row.count}
			</td>
		</tr>
	);
}

export function VariantC() {
	const shown = ACTIVITY.filter((type) => type.count !== null);
	return (
		<div className={pageContainer({ gap: 'detail', padding: 'page' })}>
			<PageHeader eyebrow="Organization" icon={HomeIcon} title="Dashboard" />
			<section className="grid gap-1">
				<LedgerHeading aside="open now">Backlog</LedgerHeading>
				<table className="w-full border-collapse">
					<tbody>
						{QUEUES.map((row) => (
							<LedgerRow key={row.key} row={row} />
						))}
					</tbody>
				</table>
			</section>
			<section className="grid gap-1">
				<LedgerHeading aside="last 7 days">Attention</LedgerHeading>
				<table className="w-full border-collapse">
					<tbody>
						{FLAGS.map((row) => (
							<LedgerRow flag key={row.key} row={row} />
						))}
					</tbody>
				</table>
			</section>
			<section className="grid gap-2">
				<LedgerHeading aside="against the 7 days before">{`Activity, ${WINDOW_LABEL}`}</LedgerHeading>
				<dl className="m-0 flex flex-wrap gap-x-6 gap-y-2">
					{shown.map((type) => (
						<div className="flex items-baseline gap-1.5" key={type.key}>
							<dd className="m-0 font-semibold text-lg tabular-nums">{type.count}</dd>
							<dt className="text-muted-foreground text-sm">{type.label.toLowerCase()}</dt>
							<DeltaBadge type={type} />
						</div>
					))}
				</dl>
			</section>
			<section className="grid gap-1">
				<LedgerHeading aside={`${PEOPLE.length} people`}>Logged Today</LedgerHeading>
				<table className="w-full border-collapse">
					<tbody>
						{PEOPLE.map((person) => (
							<tr className="border-border/60 border-b" key={person.profileId}>
								<td className="py-1.5 pr-3">
									<PersonLink person={person}>{person.name}</PersonLink>
								</td>
								<td className="py-1.5 pr-3 text-muted-foreground text-xs">
									{person.kinds.join(', ')}
								</td>
								<td className="py-1.5 pr-3 text-right text-muted-foreground text-xs tabular-nums">
									last {person.lastAt}
								</td>
								<td className="w-12 py-1.5 text-right font-semibold text-base tabular-nums">
									{person.records}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}
