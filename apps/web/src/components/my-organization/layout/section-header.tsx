import type React from 'react';

export function SectionHeader({
	action,
	meta,
	title,
}: {
	readonly action?: React.ReactNode;
	readonly meta: string;
	readonly title: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2.5">
			<div>
				<h2 className="m-0 text-base font-semibold">{title}</h2>
				<p className="mt-0.5 mb-0 text-xs leading-snug text-muted-foreground">{meta}</p>
			</div>
			{action === undefined ? null : (
				<div className="[&_a]:text-sm [&_a]:font-medium [&_a]:text-primary [&_a]:no-underline">
					{action}
				</div>
			)}
		</div>
	);
}
