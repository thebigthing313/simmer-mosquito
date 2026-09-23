import type React from 'react';

export function OrgSection({
	children,
	id,
}: {
	readonly children: React.ReactNode;
	readonly id: string;
}) {
	return (
		<section className="scroll-mt-[132px]" id={id}>
			{children}
		</section>
	);
}
