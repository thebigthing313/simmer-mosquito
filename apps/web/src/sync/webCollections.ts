import { getServerUrl } from '../auth';
import { createWebCollections } from './collections';

export const webCollections = createWebCollections({ serverUrl: getServerUrl() });
