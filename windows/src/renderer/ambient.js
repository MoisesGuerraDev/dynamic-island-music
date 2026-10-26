// Colored light behind the glass that follows the mouse (like AmbientLight in the macOS app),
// and the highlight that follows the pointer over each glass button.

export function startAmbient(notch) {
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;

  const loop = () => {
    cx += (tx - cx) * 0.22;
    cy += (ty - cy) * 0.22;
    notch.style.setProperty('--lx', `${cx.toFixed(1)}px`);
    notch.style.setProperty('--ly', `${cy.toFixed(1)}px`);
    // The two big ambient blobs drift a little toward the pointer (7 % of the distance from the center).
    notch.style.setProperty('--sx', `${((cx - notch.offsetWidth / 2) * 0.07).toFixed(1)}px`);
    notch.style.setProperty('--sy', `${((cy - notch.offsetHeight / 2) * 0.07).toFixed(1)}px`);
    raf = Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4 ? requestAnimationFrame(loop) : 0;
  };

  document.addEventListener('pointermove', (e) => {
    const inside = notch.contains(e.target);
    if (inside) {
      if (!notch.classList.contains('pointer')) {
        tx = cx = e.clientX - notch.offsetLeft;
        ty = cy = e.clientY - notch.offsetTop;
      }
      tx = e.clientX - notch.offsetLeft;
      ty = e.clientY - notch.offsetTop;
      notch.classList.add('pointer');
      if (!raf) raf = requestAnimationFrame(loop);
    }
    const t = e.target.closest && e.target.closest('.notch .tab,.notch .round,.notch .nbtn,.notch .plus');
    if (t) {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      t.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    }
  });
  document.addEventListener('pointerleave', () => notch.classList.remove('pointer'));
  notch.addEventListener('pointerleave', () => notch.classList.remove('pointer'));
}
