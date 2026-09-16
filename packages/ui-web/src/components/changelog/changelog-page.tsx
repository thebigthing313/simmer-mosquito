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
 * line: the release list carries `RELEASE_MEASURE` of its own, and a bullet
 * wraps at the same place in either app.
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

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'overview', measure, padding: 'detail' })}>
				<PageHeader description={description} icon={HistoryIcon} title={title} />
				{releases.length === 0 ? (
					<p className="text-muted-foreground text-sm">No releases have been published yet.</p>
				) : (
					<ol className={`grid gap-8 ${RELEASE_MEASURE}`}>
						{releases.map((release) => (
							<ReleaseSection
								currentVersion={currentVersion}
								key={release.version}
								release={release}
							/>
						))}
					</ol>
				)}
			</div>
		</div>
	);
}

/**
 * The measure the release entries wrap at, whatever frame they sit in.
 *
 * A bullet is a sentence, and DESIGN.md caps prose at 65 to 75 characters a
 * line. In the `record` frame a line would otherwise run 1616px on a 1920
 * screen, so the list carries the cap itself. It sits on the list rather than
 * on each bullet so a release's version bar and its entries end at one edge,
 * and it is in rem rather than ch because a ch here would be measured in the
 * list's font size, not the `text-sm` the bullets are set in: 38rem is about
 * 75 characters of that.
 */
const RELEASE_MEASURE = 'max-w-[38rem]';

function ReleaseSection({
	release,
	currentVersion,
}: {
	readonly release: ChangelogRelease;
	readonly currentVersion: string;
}) {
	return (
		<li className="grid gap-4">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
				<h2 className="font-semibold text-foreground text-lg leading-none">{release.version}</h2>
				{release.date === null ? null : (
					<span className="text-muted-foreground text-sm">{formatReleaseDate(release.date)}</span>
				)}
				{release.version === currentVersion ? (
					<Badge className="ml-auto" variant="secondary">
						You're on this version
					</Badge>
				) : null}
			</div>
			{release.groups.length === 0 && release.uncategorized.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Maintenance release with no user-facing changes.
				</p>
			) : (
				<>
					{release.uncategorized.length === 0 ? null : (
						<EntryList entries={release.uncategorized} />
					)}
					{release.groups.map((group) => (
						<section className="grid gap-2" key={group.label}>
							<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{group.label}
							</h3>
							<EntryList entries={group.entries} />
						</section>
					))}
				</>
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
 */
function formatReleaseDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return date;
	}

	return new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	}).format(new Date(year, month - 1, day));
}
