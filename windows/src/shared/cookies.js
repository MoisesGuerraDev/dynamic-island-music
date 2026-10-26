// Session cookies (no expiry date) die when the app closes. For the AI sites we want the sign-in to be remembered,
// so every cookie without an expiry gets one 90 days away, with every other attribute kept as it was.

export const AI_PARTITION = 'persist:ai';
export const PERSIST_SECONDS = 90 * 24 * 60 * 60;

/** True for a cookie that would be lost when the app closes. */
export function needsPersist(cookie) {
  return !!cookie && cookie.session === true && typeof cookie.name === 'string' && typeof cookie.domain === 'string' && cookie.domain.length > 0;
}

/** Details for session.cookies.set() that re-save the same cookie with an expiry. */
export function persistDetails(cookie, nowSeconds = Math.floor(Date.now() / 1000)) {
  const host = cookie.domain.replace(/^\./, '');
  const path = cookie.path || '/';
  const details = {
    url: `http${cookie.secure ? 's' : ''}://${host}${path}`,
    name: cookie.name,
    value: cookie.value,
    path,
    secure: !!cookie.secure,
    httpOnly: !!cookie.httpOnly,
    expirationDate: nowSeconds + PERSIST_SECONDS,
  };
  if (cookie.sameSite) details.sameSite = cookie.sameSite;
  if (!cookie.hostOnly) details.domain = cookie.domain; // host-only cookies (and __Host- ones) must not carry a domain
  return details;
}
