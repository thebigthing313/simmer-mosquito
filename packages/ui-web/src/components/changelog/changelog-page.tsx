import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import {
	type PageContainerVariants,
	pageContainer,
} from '@simmer-mosquito/ui-web/components/page-container';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { type ChangelogRelease, parseChangelog } from '@simmer-mosquito/ui-web/lib/changelog';

const HistoryIcon = iconRegistry.generic.history.icon;

/**
 * Renders a changesets-generated CHANGELOG.md as the product's release history.
 *
 * Both consoles mount this with their own markdown and their own title; nothing
 * here knows which app it is drawing. The caller passes the file contents as a
 * string: the routes get it from Vite's `?raw` import, so the whole history is
 * inlined at build time and the page needs no network at all.
 *
 * How wide the frame draws is the app's decision too, so `measure` is read off
 * `pageContainer` and the caller names the variant, the shape #1040 gave
 * `OutletContentFallback`. The default is `page`, the 1200px column, which is
 * where `apps/admin` draws it. `apps/web` passes `record`, the 112rem cap its
 * route-loading skeleton reserves, so the page arrives at the width the
 * skeleton stood in for (#1043). Release notes are prose, the one kind of
 * content the column was written for, so widening the frame must not widen a
 * line: in the `record` frame each release's entries carry `RELEASE_MEASURE`
 * beside a version rail, `RELEASE_ROW` below, and at `page` the list renders
 * what it always has, the column being the measure.
 */
export function ChangelogPage({
	markdown,
	title,
	description,
	currentVersion,
	measure = 'page',
}: {
	readonly markdown: string;
	readonly title: string;
	readonly description: string;
	/** The running build, badged against its entry so "what am I on" is answered on the page. */
	readonly currentVersion: string;
	/*
	 * `NonNullable` because cva reads `null` as "no variant, skip the default",
	 * which would draw the frame with no cap at all, the third width the
	 * `page-container` docblock rejects.
	 */
	readonly measure?: NonNullable<PageContainerVariants['measure']>;
}) {
	const releases = parseChangelog(markdown);

	// No scroller of its own: the shell's `main` scrolls the page and reserves
	// the gutter the route-loading skeleton stands in (#1053).
	return (
		<div className={pageContainer({ gap: 'overview', measure, padding: 'detail' })}>
			<PageHeader description={description} icon={HistoryIcon} title={title} />
			{releases.length === 0 ? (
				<p className="text-muted-foreground text-sm">No releases have been published yet.</p>
			) : (
				<ol className="grid gap-8">
					{releases.map((release) => (
						<ReleaseSection
							currentVersion={currentVersion}
							key={release.version}
							measure={measure}
							release={release}
						/>
					))}
				</ol>
			)}
		</div>
	);
}

/**
 * The measure the release entries wrap at in the `record` frame.
 *
 * A bullet is a sentence, and DESIGN.md caps prose at 65 to 75 characters a
 * line. In the `record` frame a line would otherwise run 1616px on a 1920
 * screen, so the entries cell carries the cap the frame no longer does. It
 * sits on the cell rather than on each bullet so a release's groups end at
 * one edge, and it is in rem rather than ch because a ch here would be
 * measured in the cell's font size, not the `text-sm` the bullets are set
 * in: 38rem is about 75 characters of that.
 */
const RELEASE_MEASURE = 'max-w-[38rem]';

/**
 * The rail the `record` frame draws beside each release from `md:` up.
 *
 * The cap leaves about 1000px of a 1920 stage empty beside the entries, so a
 * release becomes a row there: version, date and badge in a left cell, the
 * groups in the right (#1065). The rail is a fixed 12rem rather than `auto`,
 * because `auto` would size every rail on the page to the longest date and
 * move every entries column with it. The grid's own gap is the only
 * separator between releases; a rule under the version would run across the
 * rail and the column and read as a table line. Below `md:` the row stacks,
 * version, date and badge in one wrapping line over the entries, which is
 * the my-organization sections' breakpoint too. The `page` column takes none of this and renders the markup
 * it rendered before, which is what `apps/admin` draws.
 */
const RELEASE_ROW = {
	page: {
		row: 'grid gap-4',
		rail: 'flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2',
		badge: 'ml-auto',
	},
	record: {
		row: 'grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-x-6',
		// Sticky against the shell's `main`, so a long release keeps its version
		// in view while its entries scroll past.
		rail: 'flex flex-wrap items-baseline gap-x-3 gap-y-1 md:sticky md:top-4 md:flex-col md:items-start md:self-start',
		badge: 'ml-auto md:ml-0',
	},
} as const;

function ReleaseSection({
	release,
	currentVersion,
	measure,
}: {
	readonly release: ChangelogRelease;
	readonly currentVersion: string;
	readonly measure: keyof typeof RELEASE_ROW;
}) {
	const classes = RELEASE_ROW[measure];
	const entries =
		release.groups.length === 0 && release.uncategorized.length === 0 ? (
			<p className="text-muted-foreground text-sm">
				Maintenance release with no user-facing changes.
			</p>
		) : (
			<>
				{release.uncategorized.length === 0 ? null : <EntryList entries={release.uncategorized} />}
				{release.groups.map((group) => (
					<section className="grid gap-2" key={group.label}>
						<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							{group.label}
						</h3>
						<EntryList entries={group.entries} />
					</section>
				))}
			</>
		);

	return (
		<li className={classes.row}>
			<div className={classes.rail}>
				<h2 className="font-semibold text-foreground text-lg leading-none">{release.version}</h2>
				{release.date === null ? null : (
					<span className="text-muted-foreground text-sm">{formatReleaseDate(release.date)}</span>
				)}
				{release.version === currentVersion ? (
					<Badge className={classes.badge} variant="secondary">
						You're on this version
					</Badge>
				) : null}
			</div>
			{measure === 'record' ? (
				<div className={`grid gap-4 ${RELEASE_MEASURE}`}>{entries}</div>
			) : (
				entries
			)}
		</li>
	);
}

function EntryList({ entries }: { readonly entries: readonly string[] }) {
	return (
		<ul className="grid list-disc gap-1.5 pl-5 text-foreground text-sm leading-relaxed marker:text-muted-foreground">
			{entries.map((entry) => (
				<li key={entry}>{entry}</li>
			))}
		</ul>
	);
}

/**
 * `YYYY-MM-DD` is a calendar date, not an instant. Parsing it through `Date`
 * would read it as UTC midnight and draw the day before for anyone west of
 * Greenwich, which is every organization we have.
 *
 * `en-US` is pinned the way every display formatter in `apps/web/src` pins it
 * (#683): nothing offers a locale switch, so an unpinned formatter inherited
 * the machine's and the same release read `13. August 2026` on one screen and
 * `August 13, 2026` on the next, and no suite could assert either (#1066).
 * The pin picks words only; the day is the one written in the changelog.
 */
function formatReleaseDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return date;
	}

	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	}).format(new Date(year, month - 1, day));
}
