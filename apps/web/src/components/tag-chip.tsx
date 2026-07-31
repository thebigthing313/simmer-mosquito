import type { TagRow } from '@simmer-mosquito/sync';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { CSSProperties } from 'react';

/**
 * A tag, tinted from the colour the agency chose for it.
 *
 * The colour is applied as a triple — border, a wash of background, and the text
 * — from one hex value, so an agency picking any colour still lands on a chip
 * that reads. A missing or malformed colour falls back to neutral rather than
 * rendering something unreadable.
 */
export function TagChip({ tag }: { readonly tag: TagRow }) {
	const style = tagColorStyle(tag.color);
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[0.7rem]',
				style === null ? 'border-border bg-muted text-muted-foreground' : undefined,
			)}
			style={style ?? undefined}
			title={tag.description ?? undefined}
		>
			{tag.tagName}
		</span>
	);
}

/** A record's tags, wrapped. Renders nothing when it has none. */
export function TagChipRow({
	tags,
	className,
}: {
	readonly tags: readonly TagRow[];
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

/** A tinted chip style from a #RGB/#RRGGBB tag colour, or null for neutral. */
export function tagColorStyle(color: string | null): CSSProperties | null {
	if (color === null || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) {
		return null;
	}
	const hex = color.trim();
	return {
		borderColor: hexWithAlpha(hex, 0.36),
		backgroundColor: hexWithAlpha(hex, 0.14),
		color: hex,
	};
}

function hexWithAlpha(hex: string, alpha: number): string {
	const normalized =
		hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
	const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');
	return `${normalized}${value}`;
}
