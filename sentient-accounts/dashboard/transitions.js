/* ─────────────────────────────────────────────────────────
   Sentient Accounts · Page Transitions (GSAP)
   ───────────────────────────────────────────────────────── */

const PAGES = ['overview', 'charts', 'accounts', 'detail'];

// Blob opacity per page — shifts atmosphere with each section
const BLOB_STATES = {
  overview: { b1: 0.85, b2: 0.22, b3: 0.12 },
  charts:   { b1: 0.18, b2: 0.20, b3: 0.88 },
  accounts: { b1: 0.12, b2: 0.85, b3: 0.22 },
  detail:   { b1: 0.45, b2: 0.45, b3: 0.45 },
};

let currentPage = 'overview';
let isTransitioning = false;

/* ── Core navigation ────────────────────────────────────── */

function navigateTo(target, opts = {}) {
  if (target === currentPage || isTransitioning) return;
  if (!PAGES.includes(target)) return;

  const fromEl = document.querySelector(`.page[data-page="${currentPage}"]`);
  const toEl   = document.querySelector(`.page[data-page="${target}"]`);
  if (!fromEl || !toEl) return;

  isTransitioning = true;
  const dir = PAGES.indexOf(target) > PAGES.indexOf(currentPage) ? 1 : -1;

  // ── Update nav ──────────────────────────────────────────
  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('active', l.dataset.page === target)
  );

  // ── Shift blob atmosphere ───────────────────────────────
  const bs = BLOB_STATES[target];
  if (bs) {
    gsap.to('.blob-1', { opacity: bs.b1, duration: 1.6, ease: 'power2.inOut' });
    gsap.to('.blob-2', { opacity: bs.b2, duration: 1.8, ease: 'power2.inOut' });
    gsap.to('.blob-3', { opacity: bs.b3, duration: 1.4, ease: 'power2.inOut' });
  }

  // ── Prepare incoming page ───────────────────────────────
  toEl.classList.remove('page--hidden');
  gsap.set(toEl, {
    opacity: 0,
    y: dir * 56,
    filter: 'blur(12px)',
    pointerEvents: 'none',
  });

  // ── Exit current page ───────────────────────────────────
  gsap.to(fromEl, {
    opacity: 0,
    y: dir * -36,
    filter: 'blur(8px)',
    duration: 0.36,
    ease: 'power2.in',
    onComplete() {
      fromEl.classList.add('page--hidden');
      gsap.set(fromEl, { clearProps: 'all' });

      // ── Enter new page ────────────────────────────────────
      gsap.to(toEl, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.58,
        ease: 'expo.out',
        pointerEvents: 'auto',
        onComplete() {
          isTransitioning = false;

          // Stagger children in after page lands
          const staggerEls = toEl.querySelectorAll(
            '.stat-card, .chart-card, .account-chip, .mini-card, .post-row, .detail-notes'
          );
          if (staggerEls.length) {
            gsap.fromTo(
              staggerEls,
              { opacity: 0, y: 20 },
              { opacity: 1, y: 0, stagger: 0.045, duration: 0.42, ease: 'power3.out', overwrite: true }
            );
          }
        },
      });
    },
  });

  currentPage = target;
}

/* ── Custom cursor ──────────────────────────────────────── */

function initCursor() {
  const cursor = document.getElementById('cursor');
  const dot    = document.getElementById('cursorDot');

  // Skip on touch devices
  if (!cursor || !dot || window.matchMedia('(pointer: coarse)').matches) {
    if (cursor) cursor.style.display = 'none';
    if (dot)    dot.style.display    = 'none';
    return;
  }

  document.body.classList.add('has-cursor');
  gsap.set([cursor, dot], { xPercent: -50, yPercent: -50 });

  const mouse = { x: innerWidth / 2,  y: innerHeight / 2 };
  const pos   = { x: mouse.x, y: mouse.y };

  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    // Dot snaps immediately
    gsap.to(dot, { x: e.clientX, y: e.clientY, duration: 0.07, overwrite: true });
  });

  // Cursor lags behind slightly
  gsap.ticker.add(() => {
    pos.x += (mouse.x - pos.x) * 0.13;
    pos.y += (mouse.y - pos.y) * 0.13;
    gsap.set(cursor, { x: pos.x, y: pos.y });
  });

  // Scale up over interactive targets
  document.addEventListener('mouseover', e => {
    const isInteractive = e.target.closest('button, a, [role="button"], .account-chip, .stat-card');
    gsap.to(cursor, {
      scale: isInteractive ? 2.4 : 1,
      opacity: isInteractive ? 0.6 : 1,
      duration: 0.28,
      ease: 'power2.out',
    });
  });

  // Hide cursor when leaving window
  document.addEventListener('mouseleave', () => gsap.to([cursor, dot], { opacity: 0, duration: 0.2 }));
  document.addEventListener('mouseenter', () => gsap.to([cursor, dot], { opacity: 1, duration: 0.2 }));
}

/* ── Navigation setup ───────────────────────────────────── */

function initNav() {
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  const logo = document.querySelector('.nav-logo[data-page]');
  if (logo) logo.addEventListener('click', () => navigateTo('overview'));
}

/* ── Bootstrap ──────────────────────────────────────────── */

window.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initNav();

  // Set initial blob opacities
  const init = BLOB_STATES.overview;
  gsap.set('.blob-1', { opacity: init.b1 });
  gsap.set('.blob-2', { opacity: init.b2 });
  gsap.set('.blob-3', { opacity: init.b3 });

  // Animate nav in
  gsap.fromTo('#siteNav',
    { opacity: 0, y: -20 },
    { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.1 }
  );

  // Animate first page in
  const firstPage = document.querySelector('.page[data-page="overview"]');
  if (firstPage) {
    gsap.fromTo(firstPage,
      { opacity: 0, y: 32 },
      { opacity: 1, y: 0, duration: 0.85, ease: 'expo.out', delay: 0.28 }
    );
  }
});

/* ── Expose globally for script.js ─────────────────────── */
window.sentientNav = { navigateTo };
