import { errorName } from './error-name.js';
import { errorStatus } from './error-status.js';

export function isBadRequest(error: unknown): boolean {
	return errorName(error) === 'BadRequestException' || errorStatus(error) === 400;
}
