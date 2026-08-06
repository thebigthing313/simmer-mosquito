import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { ComponentProps, MouseEventHandler, ReactNode } from 'react';

export function PageShell({
	children,
	className,
	width = 'wide',
}: {
	readonly children: ReactNode;
	readonly className?: string;
	readonly width?: 'default' | 'wide';
}) {
	return (
		<section
			className={cn(
				'mx-auto my-10 grid gap-4',
				width === 'default' && 'w-[min(860px,calc(100vw-32px))]',
				width === 'wide' && 'w-[min(1080px,calc(100vw-32px))]',
				className,
			)}
		>
			{children}
		</section>
	);
}

export function AdminAppLayout({ children }: { readonly children: ReactNode }) {
	return (
		<div className="mx-auto my-7 grid w-[min(1240px,calc(100vw-32px))] items-start gap-7 md:grid-cols-[236px_minmax(0,1fr)]">
			{children}
		</div>
	);
}

export function AdminContent({ children }: { readonly children: ReactNode }) {
	return <div className="min-w-0">{children}</div>;
}

export function Topbar({ children }: { readonly children: ReactNode }) {
	return (
		<header className="flex items-center justify-between gap-6 border-b bg-card px-[clamp(18px,5vw,48px)] py-4 max-sm:grid max-sm:items-start">
			{children}
		</header>
	);
}

export function BrandLink({ children }: { readonly children: ReactNode }) {
	return (
		<Link
			className="text-lg leading-tight font-extrabold text-foreground no-underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
			to="/"
		>
			{children}
		</Link>
	);
}

const adminSections = [
	{ index: '01', label: 'Organizations', to: '/organizations' },
	{ index: '02', label: 'Mosquito taxonomy', to: '/taxonomy' },
	{ index: '03', label: 'Units', to: '/units' },
] as const;

export function AdminSidebar() {
	return (
		<aside
			className={cn(
				'grid gap-1.5 rounded-lg border border-[color-mix(in_oklch,var(--brand)_22%,var(--border))] p-2.5',
				'bg-[linear-gradient(180deg,color-mix(in_oklch,var(--accent)_21%,var(--surface-muted)),var(--surface-muted)_58%)]',
				'max-md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]',
			)}
			aria-label="Admin sections"
		>
			<div className="flex items-center justify-between px-3 pt-1 pb-2 text-xs leading-tight font-extrabold text-primary uppercase">
				<span>Control plane</span>
				<span className="text-[0.72rem] text-primary/70">3 sections</span>
			</div>
			{adminSections.map((section) => (
				<Button
					asChild
					className={cn(
						'grid h-10 grid-cols-[28px_minmax(0,1fr)] justify-start gap-2 border-[color-mix(in_oklch,var(--brand)_16%,var(--border))] bg-[color-mix(in_oklch,var(--surface)_75%,var(--surface-strong))] px-3 text-[color-mix(in_oklch,var(--text)_74%,var(--brand))]',
						'[&.active]:border-[color-mix(in_oklch,var(--brand)_52%,var(--border))] [&.active]:bg-[color-mix(in_oklch,var(--brand)_25%,var(--surface))] [&.active]:text-primary',
						'[&.active_[data-slot=nav-index]]:bg-primary [&.active_[data-slot=nav-index]]:text-primary-foreground',
					)}
					key={section.to}
					variant="outline"
				>
					<Link activeProps={{ className: 'active' }} to={section.to}>
						<span
							className="inline-flex size-6 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--brand)_14%,var(--surface))] text-[0.68rem] font-extrabold text-primary"
							data-slot="nav-index"
						>
							{section.index}
						</span>
						<span>{section.label}</span>
					</Link>
				</Button>
			))}
		</aside>
	);
}

export function PageHeading({
	eyebrow,
	title,
	description,
}: {
	readonly eyebrow: string;
	readonly title: string;
	readonly description: string;
}) {
	return (
		<header className="flex items-end justify-between gap-4">
			<div>
				<p className="mb-1 text-xs leading-tight font-extrabold text-primary uppercase">
					{eyebrow}
				</p>
				<h1 className="m-0 text-2xl leading-tight font-bold text-foreground">{title}</h1>
				<p className="mt-2 max-w-[70ch] text-base leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>
		</header>
	);
}

export function StatusMessage({
	children,
	tone,
}: {
	readonly children: ReactNode;
	readonly tone?: 'error' | 'info' | 'success';
}) {
	if (children === '') {
		return null;
	}
	const message = typeof children === 'string' ? children : '';
	const resolvedTone =
		tone ??
		(message.endsWith('...')
			? 'info'
			: /^(genus|invitation|organization|species|unit)\s.+\.$/i.test(message)
				? 'success'
				: 'error');
	return (
		<p
			className={cn(
				'rounded-lg border px-3 py-2 text-sm leading-snug font-semibold [overflow-wrap:anywhere]',
				resolvedTone === 'info' &&
					'border-[color-mix(in_oklch,var(--info)_22%,var(--border))] bg-[color-mix(in_oklch,var(--info)_6%,var(--surface-muted))] text-[var(--info)]',
				resolvedTone === 'success' &&
					'border-[color-mix(in_oklch,var(--success)_22%,var(--border))] bg-[color-mix(in_oklch,var(--success)_7%,var(--surface-muted))] text-[var(--success)]',
				resolvedTone === 'error' &&
					'border-[color-mix(in_oklch,var(--warning)_28%,var(--border))] bg-[color-mix(in_oklch,var(--attention)_24%,var(--surface-muted))] text-[var(--warning)]',
			)}
			role={resolvedTone === 'error' ? 'alert' : 'status'}
			aria-live="polite"
		>
			{children}
		</p>
	);
}

export function FormGrid({
	children,
	className,
	compact = false,
}: {
	readonly children: ReactNode;
	readonly className?: string;
	readonly compact?: boolean;
}) {
	return (
		<div
			className={cn(
				'grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5',
				compact && 'border-t pt-4',
				className,
			)}
		>
			{children}
		</div>
	);
}

export function FormActions({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return <div className={cn('flex justify-end gap-2', className)}>{children}</div>;
}

export function AdminEmpty({
	action,
	description,
	title,
}: {
	readonly action?: ReactNode;
	readonly description: string;
	readonly title: string;
}) {
	return (
		<Empty className="items-start justify-start border-t border-dashed px-0 py-7 text-left md:p-7">
			<EmptyHeader className="items-start text-left">
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action === undefined ? null : <EmptyContent className="items-start">{action}</EmptyContent>}
		</Empty>
	);
}

export function RecordActions({ children }: { readonly children: ReactNode }) {
	return <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{children}</div>;
}

export function RecordRow({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return (
		<article
			className={cn(
				'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2 max-sm:grid-cols-1 [&_h3]:m-0 [&_h3]:truncate [&_h3]:text-sm [&_h3]:leading-tight [&_h3]:font-bold [&_p]:mt-1 [&_p]:mb-0 [&_p]:truncate [&_p]:text-sm [&_p]:leading-snug [&_p]:text-muted-foreground',
				className,
			)}
		>
			{children}
		</article>
	);
}

export function FactGrid({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return (
		<dl
			className={cn(
				'grid grid-cols-3 gap-2.5 max-sm:grid-cols-1 [&_div]:min-w-0 [&_div]:rounded-lg [&_div]:border [&_div]:bg-[color-mix(in_oklch,var(--brand)_4%,var(--surface-muted))] [&_div]:p-2.5 [&_dt]:text-xs [&_dt]:leading-tight [&_dt]:font-bold [&_dt]:text-muted-foreground [&_dt]:uppercase [&_dd]:mt-1.5 [&_dd]:[overflow-wrap:anywhere] [&_dd]:text-sm [&_dd]:leading-snug [&_dd]:font-medium [&_dd]:text-foreground [&_dd]:tabular-nums',
				className,
			)}
		>
			{children}
		</dl>
	);
}

export function BackLink({ children, ...props }: Omit<ComponentProps<typeof Link>, 'className'>) {
	return (
		<Button asChild className="mb-4 w-fit" size="sm" variant="ghost">
			<Link {...props}>{children}</Link>
		</Button>
	);
}

export function EditDialogButton({
	label = 'Edit',
	onClick,
}: {
	readonly label?: string;
	readonly onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
	return (
		<Button size="sm" type="button" variant="outline" onClick={onClick}>
			{label}
		</Button>
	);
}

export function DeleteConfirmDialog({
	actionLabel = 'Delete',
	children,
	description,
	onDelete,
	title,
	triggerLabel = 'Delete',
}: {
	readonly actionLabel?: string;
	readonly children?: ReactNode;
	readonly description: string;
	readonly onDelete: () => Promise<void>;
	readonly title: string;
	readonly triggerLabel?: string;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button size="sm" type="button" variant="outline">
					{triggerLabel}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{children}
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
						{actionLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function LoadingRows({
	count = 3,
	label = 'Loading records',
}: {
	readonly count?: number;
	readonly label?: string;
}) {
	const rowKeys = Array.from({ length: count }, (_, rowNumber) => `loading-row-${rowNumber + 1}`);
	return (
		<div className="grid gap-2" aria-label={label} aria-busy="true" role="status">
			{rowKeys.map((rowKey) => (
				<div
					className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 rounded-lg border bg-card px-3 py-3 max-sm:grid-cols-1"
					key={rowKey}
				>
					<div className="grid min-w-0 gap-2">
						<Skeleton className="h-4 w-2/3 max-w-80" />
						<Skeleton className="h-3 w-1/2 max-w-60" />
					</div>
					<Skeleton className="h-8 w-full max-w-32 justify-self-end max-sm:justify-self-start" />
				</div>
			))}
		</div>
	);
}
