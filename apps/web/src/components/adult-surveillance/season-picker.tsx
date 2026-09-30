import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { ChevronDownIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { formatCount } from '../../lib/format-count';
import { type CollectionYear, splitSeasons } from './trap-directory-data';
import { DirectoryTab, DirectoryTabsList } from './trap-directory-tabs';

/**
 * The season row over a trap's collection history: the three most recent
 * seasons as tabs, and Earlier Seasons beside them. Before the older seasons
 * load, Earlier Seasons is a button that asks for them; once they are in, it is
 * a menu listing each with its Collection count, and it shows the season open
 * when that season is one of them. Sits inside the history's `Tabs`, whose value
 * is `openKey`.
 */
export function SeasonPicker({
	years,
	openKey,
	onOpen,
	onLoadEarlier,
	menuTriggerId,
}: {
	readonly years: readonly CollectionYear[];
	/** The season on screen, a tab's value or an older season's key. */
	readonly openKey: string;
	readonly onOpen: (key: string) => void;
	/** Lifts the default season window. Absent once every season is loaded. */
	readonly onLoadEarlier?: (() => void) | undefined;
	/** The menu trigger's id, which labels the panel while an older season is open. */
	readonly menuTriggerId: string;
}) {
	const { recent, older } = splitSeasons(years);

	return (
		<div className="flex items-center gap-2">
			<div className="min-w-0 flex-1">
				<DirectoryTabsList label="Season">
					{recent.map((year) => (
						<DirectoryTab key={year.key} value={year.key}>
							{year.label}
							<SeasonCount year={year} />
						</DirectoryTab>
					))}
				</DirectoryTabsList>
			</div>
			{onLoadEarlier === undefined ? (
				older.length === 0 ? null : (
					<EarlierSeasonsMenu
						onOpen={onOpen}
						open={older.find((year) => year.key === openKey)}
						older={older}
						triggerId={menuTriggerId}
					/>
				)
			) : (
				<Button className="shrink-0" onClick={onLoadEarlier} size="sm" variant="ghost">
					Earlier Seasons
				</Button>
			)}
		</div>
	);
}

/** Every season older than the tabs, one menu entry each. */
function EarlierSeasonsMenu({
	older,
	open,
	onOpen,
	triggerId,
}: {
	readonly older: readonly CollectionYear[];
	/** The open season when it is one of `older`. */
	readonly open: CollectionYear | undefined;
	readonly onOpen: (key: string) => void;
	readonly triggerId: string;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className="relative shrink-0 text-foreground/70 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-foreground after:opacity-0 data-[selected=true]:text-foreground data-[selected=true]:after:opacity-100"
					data-selected={open !== undefined}
					id={triggerId}
					size="sm"
					variant="ghost"
				>
					{open === undefined ? (
						'Earlier Seasons'
					) : (
						<>
							<span className="sr-only">Earlier Seasons, </span>
							{open.label}
							<SeasonCount year={open} />
						</>
					)}
					<ChevronDownIcon aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup onValueChange={onOpen} value={open?.key ?? ''}>
					{older.map((year) => (
						<DropdownMenuRadioItem key={year.key} value={year.key}>
							{year.label}
							<SeasonCount className="ml-auto pl-4" year={year} />
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** A season's Collection count, beside its name. */
function SeasonCount({
	year,
	className,
}: {
	readonly year: CollectionYear;
	readonly className?: string | undefined;
}) {
	return (
		<span className={cn('text-muted-foreground text-xs tabular-nums', className)}>
			{formatCount(year.collections.length)}
		</span>
	);
}
