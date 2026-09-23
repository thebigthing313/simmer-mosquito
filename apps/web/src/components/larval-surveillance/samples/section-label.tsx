import type { ReactNode } from 'react';

/** The small uppercase label over one section of the sample detail page. */
export function SectionLabel({ children }: { readonly children: ReactNode }) {
	return (
		<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
			{children}
		</span>
	);
}
