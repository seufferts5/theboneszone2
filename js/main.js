/* The Bones Zone — main.js */

// ── ACTIVE NAV ──────────────────────────────────────────────
(function () {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    const isRoot = href === 'index.html' || href === './index.html' || href === '/';
    if (isRoot && (path === '/' || path.endsWith('index.html'))) {
      a.classList.add('active');
    } else if (!isRoot && path.includes(href.replace('.html', ''))) {
      if (path.includes('film')) a.classList.add('active-film');
      else if (path.includes('book')) a.classList.add('active-book');
      else a.classList.add('active');
    }
  });
})();

// ── FILTER CARDS ────────────────────────────────────────────
function initFilters() {
  const btns  = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.card[data-type]');
  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      cards.forEach(card => {
        const show = filter === 'all' || card.dataset.type === filter;
        card.style.display = show ? '' : 'none';
      });
    });
  });
}

// ── ANIMATE STAT BARS ON SCROLL ─────────────────────────────
function initStatBars() {
  const fills = document.querySelectorAll('.stat-fill[data-pct]');
  if (!fills.length) return;

  // set initial width to 0
  fills.forEach(f => { f.style.width = '0%'; });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        requestAnimationFrame(() => {
          el.style.width = el.dataset.pct + '%';
        });
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.2 });

  fills.forEach(f => observer.observe(f));
}

// ── STAGGER CARD ANIMATIONS ──────────────────────────────────
function initCardStagger() {
  const cards = document.querySelectorAll('.card.animate-in');
  cards.forEach((card, i) => {
    card.style.animationDelay = (i * 0.06) + 's';
  });
}

// ── SCREENSHOTS TOGGLE ───────────────────────────────────────
function toggleScreenshots(btn) {
  const body = btn.nextElementSibling;
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', !expanded);
  if (expanded) {
    body.hidden = true;
  } else {
    body.hidden = false;
  }
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  initStatBars();
  initCardStagger();
});
