export function isBlankSession(sealedSession: string | undefined): sealedSession is undefined {
	return sealedSession === undefined || sealedSession.trim() === '';
}
