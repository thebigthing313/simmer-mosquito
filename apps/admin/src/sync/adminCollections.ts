import { getServerUrl } from '../api';
import { createAdminCollections } from './collections';

export const adminCollections = createAdminCollections({
	serverUrl: getServerUrl(),
});
