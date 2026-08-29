import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ReactNode, useId } from 'react';

/**
 * The boxed band that holds a record's geography: the catalog reference it sits
 * on, its address, and its geometry.
 *
 * It is a box rather than a plain {@link FormSection} because the three controls
 * inside it move each other — picking a habitat replaces the drawn shape,
 * refining off an address moves the point — and the border is what says they are
 * one answer. The border also carries the section-level error, which is the
 * reason this could not just be a `FormSection` with a `note`: nothing else on a
 * form is invalid as a group.
 *
 * Ten forms drew this by hand, down to the same class strings and the same
 * `aria-labelledby` wiring, except the two that used `aria-label` instead and so
 * announced no heading at all.
 */
export function LocationSection({
	title = 'Location',
	description,
	error = null,
	gap = 'default',
	children,
}: {
	readonly title?: string;
	/** What the geometry means on this record. */
	readonly description: string;
	/** Shown under the fields and reddens the border. */
	readonly error?: string | null;
	/** Rhythm between the controls. `tight` for a band of one or two. */
	readonly gap?: 'default' | 'tight';
	readonly children: ReactNode;
}) {
	const labelId = useId();
	return (
		<section
			aria-labelledby={labelId}
			className={cn(
				'grid rounded-md border bg-muted/30 p-4',
				gap === 'tight' ? 'gap-3' : 'gap-4',
				error === null ? 'border-border/50' : 'border-destructive/60',
			)}
		>
			<div className="grid gap-0.5">
				<span className="font-semibold text-foreground text-sm leading-none" id={labelId}>
					{title}
				</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</div>

			{children}

			{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
		</section>
	);
}
