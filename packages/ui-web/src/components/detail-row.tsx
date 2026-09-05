import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

/**
 * The label-and-value rows a record's detail card is made of.
 *
 * `DetailRow` had been copy-pasted into sixteen route files, and the copies had
 * drifted apart on the one thing that has to agree: the label column was
 * `90px` in eight of them, `92px` in two, `100px` in three, `110px`, `120px`
 * and `8.5rem` in one each. Eight widths for one row means two cards on the
 * same page start their values at different places.
 *
 * The width here is `7.5rem`, the widest the copies had converged on. It clears
 * the longest label in the workspace ("Email verified", on the account page,
 * which is why that copy had grown to `8.5rem`), and it is the column
 * `CustomFieldsList` already uses, so the habitat page's two fact lists line up
 * instead of sitting eight pixels apart. Nothing needs more.
 *
 * ## One empty marker
 *
 * The copies also disagreed on what an absent value reads as. Five rows on the
 * address page said "—", three on the account page said "—" through a helper
 * called `orNotSet`, six on the contact page said "Not set" through a different
 * helper with the same name, and four more said "—" through `EmptyValue`. Same
 * absence, four spellings, two of them from functions named the same thing.
 *
 * A row with no value now says so here, once, and says "Not recorded" rather
 * than an em dash: `docs/writing-style.md` bans the em dash from anything an
 * agent writes for a screen, and a dash also asks the reader to work out
 * whether the row is empty or still loading.
 *
 * `empty` is for the rows that mean something more specific than "nothing":
 * "Unassigned", "None", "Pending", "Unfiled". Those say why the value is
 * missing, which is worth more than the default, so they stay.
 *
 * `CustomFieldsList` in `apps/web` is the one list that keeps its own row and
 * still belongs in a {@link DetailList}. Its labels are written by the
 * organization rather than by us, so they wrap instead of truncating, and a
 * retired field carries a badge inside the label. Same column, different `dt`.
 */
export function DetailRow({
	label,
	empty = 'Not recorded',
	children,
}: {
	readonly label: string;
	/** What the row reads when it has no value. */
	readonly empty?: string;
	readonly children?: ReactNode;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">
				{isAbsent(children) ? <span className="text-muted-foreground">{empty}</span> : children}
			</dd>
		</div>
	);
}

/**
 * The `<dl>` a run of {@link DetailRow}s sits in.
 *
 * Fourteen of the sixteen copies wrote `grid gap-2.5` on their own `<dl>`, so
 * the rhythm between rows is settled here too. `className` is for what a
 * particular card adds around that, such as the rule the service request page
 * draws above its second group.
 */
export function DetailList({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return <dl className={cn('m-0 grid gap-2.5', className)}>{children}</dl>;
}

/**
 * Whether a row was handed nothing.
 *
 * `null` and `undefined` are what a missing column arrives as. `false` is what
 * `{flag && <Value />}` leaves behind. A blank or whitespace-only string is a
 * column the record has but never filled, which reads on screen as a row with
 * no value and should say the same thing as a null one.
 */
function isAbsent(children: ReactNode): boolean {
	if (children === null || children === undefined || children === false) {
		return true;
	}
	return typeof children === 'string' && children.trim() === '';
}
