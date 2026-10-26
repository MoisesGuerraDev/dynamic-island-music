'use strict';
// Runs before the page scripts of the AI sites (and their sign-in pop-ups). Passkeys (WebAuthn) do not work inside
// an embedded view, so the sites are told they do not exist and fall back to password or e-mail code sign-in.
const { webFrame } = require('electron');

webFrame.executeJavaScript(`(() => {
  try { delete window.PublicKeyCredential; } catch (e) {}
  try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true, writable: true }); } catch (e) {}
  try {
    const c = navigator.credentials;
    if (c) {
      for (const m of ['get', 'create']) {
        const orig = c[m] && c[m].bind(c);
        if (!orig) continue;
        c[m] = (opts) => (opts && opts.publicKey ? Promise.reject(new DOMException('Passkeys are not available here.', 'NotAllowedError')) : orig(opts));
      }
    }
  } catch (e) {}
})();`);
