import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';

export type Tone = 'catalog' | 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export function Panel({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<Card className="panel gap-0 rounded-lg py-0 shadow-none">
			<CardHeader className="px-0">
				<CardTitle>
					<h1>{title}</h1>
				</CardTitle>
			</CardHeader>
			<CardContent className="px-0">{children}</CardContent>
		</Card>
	);
}

export function Fact({
	label,
	value,
	valueClassName,
	tone,
}: {
	readonly label: string;
	readonly value: string;
	readonly valueClassName?: string;
	readonly tone?: Tone;
}) {
	return (
		<div>
			<dt>{label}</dt>
			<dd className={valueClassName}>
				{tone === undefined ? value : <ToneBadge tone={tone}>{value}</ToneBadge>}
			</dd>
		</div>
	);
}

export function ToneBadge({
	children,
	tone = 'neutral',
	className,
}: {
	readonly children: React.ReactNode;
	readonly tone?: Tone;
	readonly className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn(
				'capitalize',
				tone === 'success' && 'border-current/20 bg-[var(--success-bg)] text-[var(--success)]',
				tone === 'warning' && 'border-current/20 bg-[var(--warning-bg)] text-[var(--warning)]',
				tone === 'info' && 'border-current/20 bg-[var(--info-bg)] text-[var(--info)]',
				tone === 'catalog' && 'border-current/20 bg-[var(--catalog-bg)] text-[var(--catalog)]',
				tone === 'danger' && 'border-current/20 bg-[var(--danger-bg)] text-[var(--danger)]',
				tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
				className,
			)}
		>
			{children}
		</Badge>
	);
}
