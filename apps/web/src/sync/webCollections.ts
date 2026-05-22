import { getServerUrl, getShapeServerUrl } from '../auth';
import { createWebCollections } from './collections';

export const webCollections = createWebCollections({
	serverUrl: getServerUrl(),
	shapeServerUrl: getShapeServerUrl(),
});
