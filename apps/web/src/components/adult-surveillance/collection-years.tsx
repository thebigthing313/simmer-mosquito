import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { type ReactNode, useId, useState } from 'react';
import { CollectionRow } from './collection-row';
import { SeasonPicker } from './season-picker';
import { type CollectionYear, splitSeasons } from './trap-directory-data';

const CollectionIcon = iconRegistry.entities.collection.icon;

export function CollectionYears({
	years,
	isReady,
	isError,
	speciesNameById,
	header,
	onLoadEarlier,
}: {
	readonly years: readonly CollectionYear[];
	readonly isReady: boolean;
	readonly isError: boolean;
	readonly speciesNameById: ReadonlyMap<string, string>;
	/** The trap this history belongs to, pinned above its own scroll. */
	readonly header: ReactNode;
	/** Lifts the default season window. Absent once every season is loaded. */
	readonly onLoadEarlier?: (() => void) | undefined;
}) {
	// The open year belongs to the trap in view, so it is component state and
	// re-anchors on the first group whenever the trap changes.
	const [openYear, setOpenYear] = useState<string | null>(null);
	const active = years.find((year) => year.key === openYear) ?? years[0];
	const menuTriggerId = useId();
	const isTabbed = splitSeasons(years).recent.some((year) => year.key === active?.key);

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
					<SeasonPicker
						menuTriggerId={menuTriggerId}
						onLoadEarlier={onLoadEarlier}
						onOpen={setOpenYear}
						openKey={active.key}
						years={years}
					/>
				}
			>
				{/*
				 * One panel, always the open year's: Radix mounts only the open tab
				 * anyway, so rendering the other years' panels would build markup no one
				 * can see and re-run every species roll-up behind it.
				 */}
				<TabsContent
					value={active.key}
					// An older season has no tab to name its panel, so the menu trigger
					// showing it does.
					{...(isTabbed ? {} : { 'aria-labelledby': menuTriggerId })}
				>
					<ul className="grid list-none gap-0 divide-y divide-border/40 overflow-hidden rounded-md border border-border/50 p-0">
						{active.collections.map((collection) => (
							<CollectionRow
								collection={collection}
								key={collection.id}
								speciesNameById={speciesNameById}
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
			<ScrollArea className="min-h-0 flex-1" type="auto">
				<div className="px-5 pt-3 pb-6">{children}</div>
			</ScrollArea>
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
