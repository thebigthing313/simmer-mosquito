import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';

/**
 * The three not-yet-rows states a list surface moves through before it has
 * rows: waiting, nothing yet, and nothing matching the current filter.
 *
 * None of them carry domain content, which is why they live here rather than in
 * either app: "nothing matches this filter" is the same statement whether the
 * filter is over an agency's habitat types or the platform's global genera. The
 * failure state is deliberately absent — the operator console answers a refused
 * read with its own allowlist branch, and that is not shareable.
 */

/**
 * Placeholder rows while a list's first read settles.
 *
 * Skeletons rather than a spinner, per the product register: the reader sees the
 * shape of what is arriving instead of an unplaced circle.
 */
export function ListLoading({ rows = 5 }: { readonly rows?: number }) {
	return (
		<div aria-busy="true" aria-label="Loading" className="grid gap-2" role="status">
			{Array.from({ length: rows }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder list with no identity
				<Skeleton className="h-14 w-full rounded-md" key={index} />
			))}
		</div>
	);
}

/** Nothing has been recorded yet. Says what the list is for, and offers the way in. */
export function ListEmpty({
	title,
	description,
	icon: EmptyIcon,
	action,
}: {
	readonly title: string;
	readonly description: ReactNode;
	readonly icon?: RegistryIcon | undefined;
	/** The control that creates the first record — omitted when the reader cannot. */
	readonly action?: ReactNode | undefined;
}) {
	return (
		<Empty className="border-border/60">
			<EmptyHeader>
				{EmptyIcon === undefined ? null : (
					<EmptyMedia variant="icon">
						<EmptyIcon aria-hidden="true" />
					</EmptyMedia>
				)}
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action === undefined ? null : <EmptyContent>{action}</EmptyContent>}
		</Empty>
	);
}

/**
 * No rows matched the current filter.
 *
 * Quieter than {@link ListEmpty} — the data exists, so this asks for a shorter
 * query rather than for a first record. `noun` names what was searched when the
 * surrounding page does not already make that obvious.
 */
export function ListNoMatches({
	query,
	noun,
}: {
	readonly query: string;
	/** Plural, lowercase: "habitat types", "genera". */
	readonly noun?: string | undefined;
}) {
	return (
		<p className="rounded-md border border-border/40 border-dashed bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
			{noun === undefined ? 'Nothing matches' : `No ${noun} match`} “{query}”.
		</p>
	);
}
