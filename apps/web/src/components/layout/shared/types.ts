import type { ReactNode } from 'react';

/** Semantic emphasis used by demo records and status chips. */
export type Tone = 'neutral' | 'attention' | 'success' | 'info' | 'danger';

/** Identity rendered in the header chrome (real profile in the app, demo in previews). */
export interface LayoutIdentity {
	readonly profileName: string;
	readonly role: string;
	readonly organizationName: string;
}

/** A header tab. With `to` it navigates (router link); without, it is a static label. */
export interface PageTab {
	readonly label: string;
	readonly to?: string;
}

/**
 * The header descriptor every layout shell renders. Each design interprets it
 * differently (context line + title for the classic console, breadcrumbs for the
 * command bar, tab strip for the dual-pane workspace) but the data is shared so
 * the three designs stay comparable.
 */
export interface PageMeta {
	readonly context: string;
	readonly title: string;
	readonly summary?: string;
	readonly actions?: ReactNode;
	/** Optional in-section views, rendered as tabs by designs that support them. */
	readonly tabs?: readonly PageTab[];
	/** Label of the active tab; when set the tab strip is route-controlled. */
	readonly activeTab?: string;
}
