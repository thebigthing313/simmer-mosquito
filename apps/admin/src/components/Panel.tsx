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
	className,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
	readonly className?: string;
}) {
	return (
		<Card className={cn('gap-0 rounded-lg border-border bg-card py-0 shadow-none', className)}>
			<CardHeader className="px-5 pt-5 pb-0">
				<CardTitle className="text-lg leading-tight">{title}</CardTitle>
			</CardHeader>
			<CardContent className="px-5 pt-4 pb-5">{children}</CardContent>
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
		<Badge tone={tone} variant="outline" className={cn('capitalize', className)}>
			{children}
		</Badge>
	);
}
