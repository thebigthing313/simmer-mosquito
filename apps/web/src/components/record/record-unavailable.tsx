import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import type { ReactNode } from 'react';

/**
 * Why a record page has nothing to show.
 *
 * The distinction is the whole reason this takes an argument. "Could not be
 * loaded, try again shortly" and "could not be found, or you do not have access
 * to it" are different facts and lead the reader to different next actions —
 * wait, or stop looking. Twenty-odd pages wrote their own version of this
 * state and about half hard-coded a single message for both, so on those pages
 * a transient sync failure was indistinguishable from a permissions refusal.
 */
export type RecordUnavailableReason = 'error' | 'not-found';

/**
 * The "this record is unavailable" state, in the two shapes the app uses it.
 *
 * `inline` sits in a detail page's content column, under the back link, where
 * the surrounding chrome is already drawn. `centered` fills an edit route's
 * pane, which has no chrome of its own to sit under. Both were written by hand
 * per route, and the choice between them was made per route too — the same
 * state was vertically centred on some and top-aligned on others with nothing
 * deciding which. Now the layout follows from what kind of route it is.
 */
export function RecordUnavailable({
	noun,
	reason,
	title,
	description,
	layout = 'inline',
}: {
	/** Lowercase, as it appears mid-sentence: "collection", "service request". */
	readonly noun: string;
	readonly reason: RecordUnavailableReason;
	/** Overrides the derived "<Noun> Unavailable". */
	readonly title?: string;
	/** Overrides the derived copy, for the states that are more specific. */
	readonly description?: ReactNode;
	readonly layout?: 'inline' | 'centered';
}) {
	const body = (
		<Empty
			className={
				layout === 'centered'
					? 'max-w-md border border-border/40 bg-muted/30'
					: 'min-h-[280px] border border-border/40 bg-muted/30'
			}
		>
			<EmptyHeader>
				<EmptyTitle>{title ?? `${titleCase(noun)} Unavailable`}</EmptyTitle>
				<EmptyDescription>{description ?? defaultDescription(noun, reason)}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);

	if (layout === 'centered') {
		return <div className="flex h-full min-h-0 items-center justify-center p-8">{body}</div>;
	}
	return body;
}

function defaultDescription(noun: string, reason: RecordUnavailableReason): string {
	return reason === 'error'
		? `This ${noun} could not be loaded. Try again shortly.`
		: `This ${noun} could not be found, or you do not have access to it.`;
}

function titleCase(noun: string): string {
	return noun
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
