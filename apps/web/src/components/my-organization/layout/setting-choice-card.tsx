import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type React from 'react';

/**
 * How a setting's options are shown: one card per option, each a worked
 * example, with the selected one tinted. `badge` defaults to the "Current"
 * marker while active.
 */
export function SettingChoiceCard({
	active = false,
	badge,
	children,
	description,
	title,
}: {
	readonly active?: boolean;
	readonly badge?: React.ReactNode;
	readonly children?: React.ReactNode;
	readonly description: string;
	readonly title: string;
}) {
	return (
		<div
			className="grid content-start gap-2 rounded-md border border-border/30 bg-background p-2.5 data-[active=true]:border-primary/35 data-[active=true]:bg-[color-mix(in_oklch,var(--simmer-green-100)_36%,var(--card))]"
			data-active={active}
		>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid gap-1">
					<span className="font-medium text-sm text-foreground">{title}</span>
					<p className="m-0 text-xs leading-snug text-muted-foreground">{description}</p>
				</div>
				{badge ??
					(active ? (
						<Badge tone="success" variant="outline">
							Current
						</Badge>
					) : null)}
			</div>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}
