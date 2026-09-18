import type { AuthChallenge } from '@simmer-mosquito/auth';
import type { ChallengeBody } from '@simmer-mosquito/auth/browser';

export function challengeBody(challenge: AuthChallenge): ChallengeBody {
	return { ok: false, ...challenge };
}
