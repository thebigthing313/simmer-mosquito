/**
 * The frame every lookup catalog in the workspace is built on: habitat types,
 * collection methods, the three control-method catalogs, insecticides, and
 * formulations.
 *
 * All of them are the same page — a heading with an access badge, a lifecycle
 * split with counts, a filter that appears once the list is worth filtering, a
 * table of rows, a row menu offering edit and a reversible retire, and a dialog
 * or drawer to write in. Each was written separately, so the frame drifted: one
 * table clipped its overflow instead of scrolling it, one row menu was narrower
 * than the hint it had to hold.
 *
 * What stays in the page is what the catalog is *for* — its columns, its fields,
 * and its commands. In particular a page decides for itself whether a
 * deactivation can be pre-empted: {@link CatalogRowActions} takes that as a prop
 * and never computes it, because whether a local count is trustworthy depends on
 * whether the referring records sync eagerly.
 */

export { CatalogDeleteDialog } from './catalog-delete-dialog';
export {
	CatalogDetailPanel,
	CatalogExpandButton,
	CatalogInactiveDisclosure,
	CatalogNote,
} from './catalog-detail-panel';
export { commitCatalogWrite, toggleCatalogLifecycle } from './catalog-lifecycle';
export { CatalogLifecycleButton } from './catalog-lifecycle-button';
export { CatalogFilteredList, CatalogGroupHeader, CatalogPage } from './catalog-page';
export {
	CatalogDialogCancel,
	CatalogRecordDialog,
	useCatalogDialogOpen,
	useResetOnOpen,
} from './catalog-record-dialog';
export { CatalogDrawerCancel, CatalogRecordDrawer } from './catalog-record-drawer';
export { CatalogRowActions } from './catalog-row-actions';
export { useCatalogSearch } from './catalog-search';
export { CatalogActionsHead, CatalogNameCell, CatalogSection } from './catalog-section';
