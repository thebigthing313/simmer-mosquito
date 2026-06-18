import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

/**
 * Shared on-map control primitives. Every floating cluster is built from the
 * same chrome (translucent, blurred, softly bordered) so the controls read as
 * one system over both street and satellite basemaps.
 */

export function MapControlGroup({
	className,
	orientation = 'vertical',
	children,
}: {
	readonly className?: string;
	readonly orientation?: 'vertical' | 'horizontal';
	readonly children: ReactNode;
}) {
	return (
		<div
			className={cn(
				'flex overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-md ring-1 ring-black/[0.03] backdrop-blur-sm supports-[backdrop-filter]:bg-background/70',
				orientation === 'vertical' ? 'flex-col' : 'flex-row',
				className,
			)}
		>
			{children}
		</div>
	);
}

export function MapControlDivider({
	orientation = 'horizontal',
}: {
	readonly orientation?: 'horizontal' | 'vertical';
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'shrink-0 bg-border/70',
				orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
			)}
		/>
	);
}

export function MapControlButton({
	label,
	onClick,
	disabled = false,
	active = false,
	side = 'left',
	children,
}: {
	readonly label: string;
	readonly onClick: () => void;
	readonly disabled?: boolean;
	readonly active?: boolean;
	readonly side?: 'top' | 'right' | 'bottom' | 'left';
	readonly children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					aria-label={label}
					className={cn(
						'size-9 rounded-none text-foreground/75 transition-colors hover:bg-accent/60 hover:text-foreground',
						active && 'text-primary hover:text-primary',
					)}
					disabled={disabled}
					onClick={onClick}
					size="icon"
					type="button"
					variant="ghost"
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side={side}>{label}</TooltipContent>
		</Tooltip>
	);
}
