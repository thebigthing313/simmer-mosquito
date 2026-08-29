import type { ReactNode } from 'react';

/**
 * A titled band of fields inside a {@link RecordFormPage}.
 *
 * Five forms had grown their own copy of this, four of them byte-identical and
 * the fifth carrying a `note`, so a rule that applied to a whole section could
 * only be shown on the one form whose copy had the slot. One component, and the
 * slot is there for every form that needs it.
 */
export function FormSection({
	title,
	note,
	children,
}: {
	readonly title: string;
	/** A rule the section carries that no single field can be marked for. */
	readonly note?: string | null;
	readonly children: ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<div className="grid gap-0.5">
				<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
				{note === undefined || note === null ? null : (
					<p className="m-0 text-muted-foreground text-xs">{note}</p>
				)}
			</div>
			{children}
		</section>
	);
}
