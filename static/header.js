// Shared header: injects markup + wires behaviors. Requires auth.js loaded first
// (uses accessToken, tryRefresh, api helper, etc. from auth.js).

(function () {
  const mount = document.getElementById('site-header');
  if (!mount) return;

  mount.className = 'site-header';
  mount.innerHTML = `
    <div class="header-inner">
      <a href="/" class="brand">SethStore</a>

      <div class="header-right">
        <button id="theme-toggle" class="icon-btn" aria-label="Toggle theme" title="Toggle theme">
          <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </button>

        <button id="search-toggle" class="icon-btn" aria-label="Search" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>

        <a href="/cart" class="icon-btn cart-btn" aria-label="Cart" title="Cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span id="cart-badge" class="cart-badge" hidden>0</span>
        </a>

        <div class="dropdown-wrap">
          <button id="profile-toggle" class="icon-btn" aria-label="Profile" aria-expanded="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </button>
          <div id="profile-menu" class="dropdown" hidden></div>
        </div>
      </div>
    </div>

    <div id="search-bar" class="search-bar" hidden>
      <div class="search-inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" id="search-input" placeholder="Search products…" autocomplete="off">
      </div>
    </div>
  `;

  const themeToggle   = document.getElementById('theme-toggle');
  const searchToggle  = document.getElementById('search-toggle');
  const searchBar     = document.getElementById('search-bar');
  const searchInput   = document.getElementById('search-input');
  const profileToggle = document.getElementById('profile-toggle');
  const profileMenu   = document.getElementById('profile-menu');
  const cartBadge     = document.getElementById('cart-badge');

  // ── theme ──
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  // ── profile dropdown ──
  function renderProfileMenu(user) {
    if (user) {
      profileMenu.innerHTML = `
        <p class="muted">${escapeHtml(user.full_name || '')}</p>
        <a href="/me">Personal information</a>
        <a href="/orders">My orders</a>
        <hr>
        <button id="logout-btn">Log out</button>
      `;
      profileMenu.querySelector('#logout-btn').addEventListener('click', logout);
    } else {
      profileMenu.innerHTML = `
        <a href="/login">Log in</a>
        <a href="/signup">Sign up</a>
      `;
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      closeDropdowns();
      setCartBadge(0);
      document.dispatchEvent(new CustomEvent('auth:logout'));
      renderProfileMenu(null);
    }
  }

  function closeDropdowns() {
    profileMenu.hidden = true;
    profileToggle.setAttribute('aria-expanded', 'false');
  }

  profileToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !profileMenu.hidden;
    profileMenu.hidden = open;
    profileToggle.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('click', (e) => {
    if (!profileMenu.hidden && !profileMenu.contains(e.target) && e.target !== profileToggle) {
      closeDropdowns();
    }
  });

  // ── search ──
  searchToggle.addEventListener('click', () => {
    const open = !searchBar.hidden;
    searchBar.hidden = open;
    searchToggle.setAttribute('aria-expanded', String(!open));
    if (!open) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      document.dispatchEvent(new CustomEvent('search:clear'));
    }
  });

  searchInput.addEventListener('input', () => {
    document.dispatchEvent(new CustomEvent('search:query', { detail: searchInput.value.trim() }));
  });

  // ── cart badge ──
  function setCartBadge(count) {
    if (!count || count <= 0) {
      cartBadge.hidden = true;
      cartBadge.textContent = '0';
    } else {
      cartBadge.hidden = false;
      cartBadge.textContent = count > 99 ? '99+' : String(count);
    }
  }

  async function refreshCartBadge() {
    if (!accessToken) { setCartBadge(0); return; }
    try {
      const res = await fetch('/api/cart', {
        credentials: 'include',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401) {
        const session = await tryRefresh();
        if (!session) { setCartBadge(0); return; }
        const retry = await fetch('/api/cart', {
          credentials: 'include',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!retry.ok) { setCartBadge(0); return; }
        const data = await retry.json();
        setCartBadge(data.item_count || 0);
        return;
      }
      if (!res.ok) { setCartBadge(0); return; }
      const data = await res.json();
      setCartBadge(data.item_count || 0);
    } catch (_) {
      setCartBadge(0);
    }
  }

  // ── session bootstrap ──
  async function bootstrap() {
    try {
      const session = await tryRefresh();
      if (!session) { renderProfileMenu(null); setCartBadge(0); return; }
      const res = await fetch('/api/me', {
        credentials: 'include',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) { renderProfileMenu(null); setCartBadge(0); return; }
      const user = await res.json();
      renderProfileMenu(user);
      document.dispatchEvent(new CustomEvent('auth:login', { detail: user }));
      refreshCartBadge();
    } catch (e) {
      console.warn('session bootstrap:', e.message);
      renderProfileMenu(null);
      setCartBadge(0);
    }
  }

  // Listen for cart changes from any page
  document.addEventListener('cart:refresh', refreshCartBadge);
  document.addEventListener('cart:update', (e) => {
    if (e.detail && typeof e.detail.item_count === 'number') {
      setCartBadge(e.detail.item_count);
    } else {
      refreshCartBadge();
    }
  });

  renderProfileMenu(null);
  bootstrap();

  // expose for other scripts
  window.__header = { closeDropdowns, refreshCartBadge, setCartBadge };
})();

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
