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
				<h2 className="m-0 text-[0.98rem] font-extrabold">{title}</h2>
				<p className="mt-0.5 mb-0 text-[0.78rem] leading-snug text-muted-foreground">{meta}</p>
			</div>
			{action === undefined ? null : (
				<div className="[&_a]:text-[0.86rem] [&_a]:font-bold [&_a]:text-primary [&_a]:no-underline">
					{action}
				</div>
			)}
		</div>
	);
}
