import type { Collection } from '@tanstack/react-db';

interface MaybeSyncModeConfig {
	readonly config?: {
		readonly id?: string;
		readonly syncMode?: 'eager' | 'on-demand';
	};
}

export function assertEagerCollection<TRow extends object>(
	collection: Collection<TRow, string | number>,
	hookName: string,
): void {
	const config = (collection as Collection<TRow, string | number> & MaybeSyncModeConfig).config;
	if (config?.syncMode === 'on-demand') {
		throw new Error(
			`${hookName} only supports eager collections. Received on-demand collection "${config.id ?? 'unknown'}".`,
		);
	}
}
