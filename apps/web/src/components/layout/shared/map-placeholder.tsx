import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { mutedBodyClass, rowTitleClass } from './primitives';

/**
 * Shared, dependency-free map stand-in (no mapbox token required). Renders the
 * same gridded surveillance "map" art across all three designs so the layout
 * comparison stays focused on chrome. `size="inset"` is the smaller variant used
 * by detail pages; `size="full"` fills a map-driven panel.
 */
export function MapPlaceholder({
	caption,
	captionDetail,
	legend = true,
	size = 'full',
	className,
}: {
	readonly caption?: string;
	readonly captionDetail?: string;
	readonly legend?: boolean;
	readonly size?: 'full' | 'inset';
	readonly className?: string;
}) {
	return (
		<div
			className={cn(
				'relative isolate overflow-hidden bg-[linear-gradient(125deg,color-mix(in_oklch,var(--simmer-green-100)_56%,transparent),transparent_42%),color-mix(in_oklch,var(--simmer-workshop-map-wash)_52%,var(--card))]',
				size === 'inset' ? 'min-h-[220px]' : 'min-h-[360px]',
				className,
			)}
			role="img"
			aria-label={caption ?? 'Operational map'}
		>
			<div className="absolute inset-0 bg-[linear-gradient(var(--simmer-workshop-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--simmer-workshop-grid-line)_1px,transparent_1px)] bg-size-[36px_36px]" />
			<div className="absolute inset-[13%_48%_45%_12%] rounded-[42%_58%_38%_62%] border border-[color-mix(in_oklch,var(--simmer-green-700)_34%,transparent)] bg-[color-mix(in_oklch,var(--simmer-yellow-100)_24%,transparent)]" />
			<div className="absolute inset-[42%_14%_14%_46%] rounded-[52%_36%_55%_44%] border border-[color-mix(in_oklch,var(--simmer-green-700)_34%,transparent)] bg-[color-mix(in_oklch,var(--simmer-yellow-100)_24%,transparent)]" />
			<div className="absolute top-[36%] left-[18%] h-1 w-[58%] origin-left rotate-17 rounded-full bg-(--map-route)" />
			<div className="absolute top-[58%] left-[28%] h-1 w-[44%] origin-left rotate-[-24deg] rounded-full bg-(--map-road)" />
			<div className="absolute top-[28%] left-[26%] grid size-[30px] place-items-center rounded-full border-[3px] border-card bg-primary text-[0.76rem] font-extrabold text-primary-foreground shadow-[0_10px_18px_color-mix(in_oklch,var(--foreground)_14%,transparent)]">
				<span>1</span>
			</div>
			<div className="absolute top-[54%] left-[58%] grid size-[30px] place-items-center rounded-full border-[3px] border-card bg-(--map-alert) text-[0.76rem] font-extrabold text-foreground shadow-[0_10px_18px_color-mix(in_oklch,var(--foreground)_14%,transparent)]">
				<span>2</span>
			</div>
			<div className="absolute top-[68%] left-[42%] grid size-[30px] place-items-center rounded-full border-[3px] border-card bg-(--simmer-blue) text-[0.76rem] font-extrabold text-primary-foreground shadow-[0_10px_18px_color-mix(in_oklch,var(--foreground)_14%,transparent)]">
				<span>3</span>
			</div>
			{caption === undefined ? null : (
				<div className="absolute right-[18px] bottom-[18px] max-w-[260px] rounded-md bg-[color-mix(in_oklch,var(--card)_92%,transparent)] p-3 shadow-[0_10px_22px_color-mix(in_oklch,var(--foreground)_8%,transparent)]">
					<strong className={rowTitleClass}>{caption}</strong>
					{captionDetail === undefined ? null : <p className={mutedBodyClass}>{captionDetail}</p>}
				</div>
			)}
			{legend ? (
				<div className="absolute top-3 left-3 flex flex-wrap gap-3 rounded-md bg-[color-mix(in_oklch,var(--card)_88%,transparent)] px-3 py-2 text-[0.78rem] font-bold text-muted-foreground shadow-[0_8px_18px_color-mix(in_oklch,var(--foreground)_6%,transparent)]">
					<span className="inline-flex items-center gap-1.5">
						<i className="inline-block size-2.5 rounded-full bg-primary" /> Work item
					</span>
					<span className="inline-flex items-center gap-1.5">
						<i className="inline-block size-2.5 rounded-full bg-(--map-road)" /> Route
					</span>
					<span className="inline-flex items-center gap-1.5">
						<i className="inline-block size-2.5 rounded-full bg-(--map-alert)" /> Attention
					</span>
				</div>
			) : null}
		</div>
	);
}
