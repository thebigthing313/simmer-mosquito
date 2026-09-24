import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Tag } from '../hooks/queries/tag-view';
import { tagChipStyle } from '../lib/hex-color';

/**
 * A tag, tinted from the colour the organization chose for it.
 *
 * The colour is applied as a triple, border, a wash of background and the
 * text, from one hex value through `tagChipStyle`, which darkens the text
 * until it reads on the wash. A missing or malformed colour falls back to
 * neutral.
 */
function TagChip({ tag }: { readonly tag: Tag }) {
	const style = tagChipStyle(tag.color);
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[0.7rem]',
				style === null ? 'border-border bg-muted text-muted-foreground' : undefined,
			)}
			style={style ?? undefined}
			title={tag.description ?? undefined}
		>
			{tag.name}
		</span>
	);
}

/** A record's tags, wrapped. Renders nothing when it has none. */
export function TagChipRow({
	tags,
	className,
}: {
	readonly tags: readonly Tag[];
	readonly className?: string;
}) {
	if (tags.length === 0) {
		return null;
	}
	return (
		<span className={cn('flex flex-wrap items-center gap-1', className)}>
			{tags.map((tag) => (
				<TagChip key={tag.id} tag={tag} />
			))}
		</span>
	);
}
