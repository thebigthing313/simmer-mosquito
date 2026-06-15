import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';
import type { Tone } from './types';

/**
 * Presentational widgets shared by every design's example pages. Keeping the
 * inner page content identical across designs means the preview compares chrome,
 * not content. Ported from the demo bodies in `routes/-components.tsx`.
 */

export const pageGridClass = 'mx-auto grid w-full max-w-[1380px] content-start gap-6';
export const twelveColumnGridClass = 'grid grid-cols-12 gap-5 max-[820px]:grid-cols-1';
export const splitContentClass = 'grid min-w-0 content-start gap-5';
export const panelRowClass =
	'grid items-center gap-3.5 rounded-lg border border-border/35 bg-card/72 p-3.5';
export const mutedBodyClass = 'm-0 text-[0.86rem] leading-normal text-muted-foreground';
export const rowTitleClass = 'text-[0.95rem] text-foreground';
export const compactLabelClass = 'text-[0.78rem] font-bold text-muted-foreground';

export function spanClass(columns: 4 | 5 | 7 | 8): string {
	const spans = {
		4: 'col-span-4 max-[820px]:col-auto',
		5: 'col-span-5 max-[820px]:col-auto',
		7: 'col-span-7 max-[820px]:col-auto',
		8: 'col-span-8 max-[820px]:col-auto',
	};

	return spans[columns];
}

export function toneBackgroundClass(tone: Tone): string {
	const backgrounds = {
		attention: 'bg-[color-mix(in_oklch,var(--warning-bg)_46%,var(--card))]',
		danger: 'bg-[color-mix(in_oklch,var(--danger-bg)_44%,var(--card))]',
		success: 'bg-[color-mix(in_oklch,var(--success-bg)_42%,var(--card))]',
		info: 'bg-[color-mix(in_oklch,var(--info-bg)_42%,var(--card))]',
		neutral: 'bg-card',
	};

	return backgrounds[tone];
}

export function Surface({
	className,
	children,
}: {
	readonly className?: string;
	readonly children: React.ReactNode;
}) {
	return (
		<Card variant="surface" className={cn('rounded-lg border-border/35 bg-card/88', className)}>
			<CardContent padding="default" className="grid gap-4">
				{children}
			</CardContent>
		</Card>
	);
}

export function PageHeader({
	kicker,
	title,
	body,
	action,
}: {
	readonly kicker: string;
	readonly title: string;
	readonly body: string;
	readonly action?: React.ReactNode;
}) {
	return (
		<header className="grid gap-4 border-b border-border/45 pb-4 min-[821px]:grid-cols-[minmax(0,1fr)_auto] min-[821px]:items-end">
			<div className="grid max-w-[72ch] gap-2">
				<p className="eyebrow">{kicker}</p>
				<h1 className="m-0 text-[1.65rem] leading-tight font-extrabold text-foreground">{title}</h1>
				<p className="m-0 leading-normal text-muted-foreground">{body}</p>
			</div>
			{action === undefined ? null : <div className="shrink-0">{action}</div>}
		</header>
	);
}

export function SectionHeader({
	title,
	meta,
	action,
}: {
	readonly title: string;
	readonly meta?: string;
	readonly action?: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 border-b border-border/35 pb-3">
			<div>
				<h2 className="m-0 text-[1.06rem] font-extrabold">{title}</h2>
				{meta === undefined ? null : (
					<p className="mt-1 mb-0 text-[0.84rem] text-muted-foreground">{meta}</p>
				)}
			</div>
			{action === undefined ? null : (
				<div className="[&_a]:text-[0.86rem] [&_a]:font-bold [&_a]:text-primary [&_a]:no-underline">
					{action}
				</div>
			)}
		</div>
	);
}

export function SummaryTile({
	label,
	value,
	detail,
	tone,
}: {
	readonly label: string;
	readonly value: string;
	readonly detail: string;
	readonly tone: Tone;
}) {
	return (
		<div
			className={cn(
				'grid min-h-[124px] content-start gap-3 rounded-lg border border-border/35 p-4',
				toneBackgroundClass(tone),
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<span className={compactLabelClass}>{label}</span>
				<span className="mt-1 size-2.5 rounded-full bg-primary/65" aria-hidden="true" />
			</div>
			<div className="flex items-end justify-between gap-3 max-[560px]:flex-col max-[560px]:items-start">
				<strong className="text-[1.65rem] leading-none text-foreground">{value}</strong>
				<p className="m-0 text-right text-[0.82rem] leading-normal text-muted-foreground max-[560px]:text-left">
					{detail}
				</p>
			</div>
		</div>
	);
}

export function WorkRow({
	item,
}: {
	readonly item: {
		readonly id: string;
		readonly label: string;
		readonly kind: string;
		readonly place: string;
		readonly status: string;
		readonly time: string;
		readonly tone: Tone;
	};
}) {
	return (
		<article
			className={cn(panelRowClass, 'grid-cols-[70px_minmax(0,1fr)_auto] max-[560px]:grid-cols-1')}
		>
			<div className={compactLabelClass}>{item.time}</div>
			<div>
				<strong className={rowTitleClass}>{item.label}</strong>
				<p className={mutedBodyClass}>
					{item.id} · {item.kind} · {item.place}
				</p>
			</div>
			<StatusBadge tone={item.tone}>{item.status}</StatusBadge>
		</article>
	);
}

export function SignalRow({
	label,
	value,
	detail,
	tone,
}: {
	readonly label: string;
	readonly value: string;
	readonly detail: string;
	readonly tone: Tone;
}) {
	return (
		<div
			className={cn(
				'flex items-center justify-between gap-3 rounded-lg border border-border/35 p-3.5',
				toneBackgroundClass(tone),
			)}
		>
			<div>
				<strong className={rowTitleClass}>{label}</strong>
				<p className={mutedBodyClass}>{detail}</p>
			</div>
			<span className="font-extrabold text-primary">{value}</span>
		</div>
	);
}

export function TimelineItem({
	title,
	detail,
}: {
	readonly title: string;
	readonly detail: string;
}) {
	return (
		<div className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5">
			<span className="mt-1.5 size-2.5 rounded-full border-2 border-primary bg-card" />
			<div>
				<strong className={rowTitleClass}>{title}</strong>
				<p className={mutedBodyClass}>{detail}</p>
			</div>
		</div>
	);
}

export function Fact({ label, value }: { readonly label: string; readonly value: string }) {
	return (
		<div className="grid gap-1 rounded-lg border border-border/35 bg-card/78 p-3">
			<span className={compactLabelClass}>{label}</span>
			<strong className="text-[0.9rem]">{value}</strong>
		</div>
	);
}

export function StatusBadge({
	tone,
	children,
}: {
	readonly tone: Tone;
	readonly children: React.ReactNode;
}) {
	const mappedTone: React.ComponentProps<typeof Badge>['tone'] =
		tone === 'attention'
			? 'warning'
			: tone === 'neutral'
				? 'neutral'
				: tone === 'success'
					? 'success'
					: tone === 'info'
						? 'info'
						: 'danger';

	return (
		<Badge variant="outline" tone={mappedTone}>
			{children}
		</Badge>
	);
}

export function initialsFor(name: string): string {
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

	return initials.length === 0 ? 'SU' : initials;
}
