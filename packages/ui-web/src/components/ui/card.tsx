import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

const cardVariants = cva('flex flex-col text-card-foreground', {
	variants: {
		variant: {
			default: 'gap-6 rounded-xl border bg-card py-6 shadow-sm',
			panel: 'gap-0 rounded-lg border-border bg-card py-0 shadow-none',
			surface: 'gap-0 rounded-md border-transparent bg-card py-0 shadow-none',
			inset: 'gap-0 rounded-md border-border bg-muted/40 py-0 shadow-none',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

const cardContentVariants = cva('', {
	variants: {
		padding: {
			default: 'px-6',
			none: 'p-0',
			compact: 'px-4 py-3',
		},
	},
	defaultVariants: {
		padding: 'default',
	},
});

interface CardProps extends React.ComponentProps<'div'>, VariantProps<typeof cardVariants> {}

function Card({ className, variant, ...props }: CardProps) {
	return (
		<div
			data-slot="card"
			className={cn(cardVariants({ variant }), className)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
				className,
			)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-title"
			className={cn('leading-none font-semibold', className)}
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-description"
			className={cn('text-sm text-muted-foreground', className)}
			{...props}
		/>
	);
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-action"
			className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
			{...props}
		/>
	);
}

interface CardContentProps
	extends React.ComponentProps<'div'>,
		VariantProps<typeof cardContentVariants> {}

function CardContent({ className, padding, ...props }: CardContentProps) {
	return (
		<div
			data-slot="card-content"
			className={cn(cardContentVariants({ padding }), className)}
			{...props}
		/>
	);
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-footer"
			className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
			{...props}
		/>
	);
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
