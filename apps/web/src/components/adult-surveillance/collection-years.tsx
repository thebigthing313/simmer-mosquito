import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { type ReactNode, useState } from 'react';
import { formatCount } from '../../lib/format-count';
import { CollectionRow } from './collection-row';
import type { CollectionYear } from './trap-directory-data';
import { DirectoryTab, DirectoryTabsList } from './trap-directory-tabs';

const CollectionIcon = iconRegistry.entities.collection.icon;

export function CollectionYears({
	years,
	isReady,
	isError,
	speciesNameById,
	timeZone,
	header,
	onLoadEarlier,
}: {
	readonly years: readonly CollectionYear[];
	readonly isReady: boolean;
	readonly isError: boolean;
	readonly speciesNameById: ReadonlyMap<string, string>;
	/** Resolved once for the pane and handed down, not read per row. */
	readonly timeZone: string;
	/** The trap this history belongs to, pinned above its own scroll. */
	readonly header: ReactNode;
	/** Lifts the default season window. Absent once every season is loaded. */
	readonly onLoadEarlier?: (() => void) | undefined;
}) {
	// The open year belongs to the trap in view, so it is component state and
	// re-anchors on the first group whenever the trap changes.
	const [openYear, setOpenYear] = useState<string | null>(null);
	const active = years.find((year) => year.key === openYear) ?? years[0];

	if (isError) {
		return (
			<HistoryFrame header={header}>
				<HistoryMessage
					description="Collection records could not be loaded. Try again shortly."
					title="Collections Unavailable"
				/>
			</HistoryFrame>
		);
	}
	if (!isReady) {
		return (
			<HistoryFrame header={header}>
				<div className="grid gap-2">
					{[0, 1, 2, 3, 4].map((index) => (
						<Skeleton className="h-12 w-full" key={index} />
					))}
				</div>
			</HistoryFrame>
		);
	}
	if (active === undefined) {
		return (
			<HistoryFrame header={header}>
				<HistoryMessage
					description="Nothing has been collected from this trap yet. Record a collection to start its history."
					title="No Collections"
				/>
			</HistoryFrame>
		);
	}

	return (
		<Tabs
			className="flex h-full min-h-0 flex-col gap-0"
			onValueChange={setOpenYear}
			value={active.key}
		>
			<HistoryFrame
				header={header}
				tabs={
					<div className="flex items-center gap-2">
						<div className="min-w-0 flex-1">
							<DirectoryTabsList label="Season">
								{years.map((year) => (
									<DirectoryTab key={year.key} value={year.key}>
										{year.label}
										<span className="text-muted-foreground text-xs tabular-nums">
											{formatCount(year.collections.length)}
										</span>
									</DirectoryTab>
								))}
							</DirectoryTabsList>
						</div>
						{onLoadEarlier === undefined ? null : (
							<Button className="shrink-0" onClick={onLoadEarlier} size="sm" variant="ghost">
								Earlier seasons
							</Button>
						)}
					</div>
				}
			>
				{/*
				 * One panel, always the open year's: Radix mounts only the open tab
				 * anyway, so rendering the other years' panels would build markup no one
				 * can see and re-run every species roll-up behind it.
				 */}
				<TabsContent value={active.key}>
					<ul className="grid list-none gap-0 divide-y divide-border/40 overflow-hidden rounded-md border border-border/50 p-0">
						{active.collections.map((collection) => (
							<CollectionRow
								collection={collection}
								key={collection.id}
								speciesNameById={speciesNameById}
								timeZone={timeZone}
							/>
						))}
					</ul>
				</TabsContent>
			</HistoryFrame>
		</Tabs>
	);
}

/** The pane's geometry: the trap and its years pinned, the collections scrolling under them. */
function HistoryFrame({
	header,
	tabs,
	children,
}: {
	readonly header: ReactNode;
	readonly tabs?: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className={stickyHeader({ gap: 'default', padding: 'roomy' })}>
				{header}
				{tabs}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-6">{children}</div>
		</div>
	);
}

// --- one collection ---------------------------------------------------------

function HistoryMessage({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[160px] border border-border/40 bg-muted/20">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CollectionIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
