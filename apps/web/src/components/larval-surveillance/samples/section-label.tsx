import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import type { ReactNode } from 'react';

/** The small uppercase label over one section of the sample detail page. */
export function SectionLabel({ children }: { readonly children: ReactNode }) {
	return <span className={eyebrow()}>{children}</span>;
}
