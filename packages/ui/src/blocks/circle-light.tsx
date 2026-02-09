import { cn } from '@simmer/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const lightVariants = cva('rounded-full', {
	variants: {
		size: {
			small: 'h-1.5 w-1.5',
			default: 'h-2.5 w-2.5',
			large: 'h-5 w-5',
		},
		color: {
			green: 'bg-simmer-green shadow-[0_0_8px_rgba(52,211,153,0.4)]',
			purple: 'bg-simmer-purple shadow-[0_0_8px_rgba(139,92,246,0.4)]',
			yellow: 'bg-simmer-yellow shadow-[0_0_8px_rgba(251,191,36,0.4)]',
		},
	},
	defaultVariants: {
		size: 'default',
		color: 'green',
	},
});

function CircleLight({
	color,
	size,
	className,
	...props
}: ComponentProps<'div'> & VariantProps<typeof lightVariants>) {
	return (
		<div
			className={cn(lightVariants({ color, size }), className)}
			{...props}
		></div>
	);
}

export { CircleLight, lightVariants };
