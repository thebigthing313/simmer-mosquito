import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type React from 'react';

export function LookupListFrame({
	action,
	activeCount,
	children,
	detail,
	inactiveCount,
	title,
}: {
	readonly action?: React.ReactNode;
	readonly activeCount?: number;
	readonly children: React.ReactNode;
	readonly detail?: string | undefined;
	readonly inactiveCount?: number;
	readonly title: string;
}) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid min-w-0 gap-1">
					<span className="font-medium wrap-anywhere text-sm text-foreground">{title}</span>
					{detail === undefined ? null : (
						<p className="m-0 text-sm leading-snug text-muted-foreground">{detail}</p>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{activeCount === undefined ? null : (
						<Badge tone="success" variant="outline">
							{activeCount} active
						</Badge>
					)}
					{inactiveCount === undefined ? null : (
						<Badge tone="neutral" variant="outline">
							{inactiveCount} inactive
						</Badge>
					)}
					{action}
				</div>
			</div>
			<div className="grid gap-2">{children}</div>
		</section>
	);
}
