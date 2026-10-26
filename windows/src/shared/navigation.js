// Where the AI pages may go and what may be opened outside the app. Everything else is refused.

/** Sites of the AIs and of their sign-in (Google, Apple, Microsoft), with their subdomains. */
export const AI_NAV_DOMAINS = [
  'claude.ai', 'anthropic.com', 'chatgpt.com', 'openai.com', 'deepseek.com',
  'google.com', 'gstatic.com',
  'appleid.apple.com',
  'microsoft.com', 'live.com', 'microsoftonline.com',
  'cloudflare.com', 'recaptcha.net',
];

function parse(url) {
  try {
    return new URL(String(url));
  } catch {
    return null;
  }
}

/** Only https, with no user:password in the address. Never file:, javascript:, data:, http: or odd schemes. */
export function isHttpsUrl(url) {
  const u = parse(url);
  return !!u && u.protocol === 'https:' && !u.username && !u.password && String(url).length <= 4000;
}

export function hostAllowed(host) {
  const h = String(host || '').toLowerCase();
  return !!h && AI_NAV_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** True if an AI page may navigate (or open a sign-in window) to this address. */
export function navAllowed(url) {
  const u = parse(url);
  return isHttpsUrl(url) && hostAllowed(u.hostname);
}
