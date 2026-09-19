// ── DOM refs ──
const view    = document.getElementById('product-view');
const errorEl = document.getElementById('product-error');

// ── API helper ──
async function apiGet(path) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Authenticated fetch with one refresh-retry on 401
async function cartFetch(path, { method = 'GET', body } = {}) {
  const doFetch = () => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(path, {
      method,
      credentials: 'include',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  if (!accessToken) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return null; }
  }

  let res = await doFetch();
  if (res.status === 401) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return null; }
    res = await doFetch();
  }

  let data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── product ──
function getProductId() {
  const params = new URLSearchParams(location.search);
  if (params.get('id')) return params.get('id');
  return location.hash.slice(1) || null;
}

async function loadProduct() {
  const id = getProductId();
  if (!id) {
    showMsg(errorEl, 'No product specified.');
    return;
  }
  try {
    const p = await apiGet(`/api/products/${encodeURIComponent(id)}`);
    renderProduct(p);
  } catch (e) {
    console.error(e);
    showMsg(errorEl, 'Could not load this product. It may have been removed.');
  }
}

function renderProduct(p) {
  document.title = `${p.Name} — SethStore`;

  const images = p.Images || [];
  const mainImage = images[0] || null;

  view.innerHTML = `
    <div class="product-media">
      <div class="product-main-img" id="main-img-wrap">
        ${mainImage
          ? `<img id="main-img" src="${escapeAttr(mainImage)}" alt="${escapeAttr(p.Name)}">`
          : '<span class="muted">No image</span>'}
      </div>
      ${images.length > 1 ? `
        <div class="thumbs">
          ${images.map((src, i) => `
            <button class="thumb${i === 0 ? ' active' : ''}" data-src="${escapeAttr(src)}">
              <img src="${escapeAttr(src)}" alt="" loading="lazy">
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <div class="product-info">
      <span class="product-category">${escapeHtml(p.Category || '')}</span>
      <h1 class="product-title">${escapeHtml(p.Name)}</h1>
      <p class="product-price">₦${escapeHtml(p.Price)}</p>

      <p class="product-stock ${p.Stock > 0 ? 'stock-ok' : 'stock-out'}">
        ${p.Stock > 0 ? `${p.Stock} in stock` : 'Out of stock'}
      </p>

      <div class="product-desc">
        <h2>Description</h2>
        <p>${escapeHtml(p.Description || 'No description provided.')}</p>
      </div>

      <div class="product-actions">
        <button class="btn-primary" id="add-to-cart" ${p.Stock <= 0 ? 'disabled' : ''}>
          ${p.Stock > 0 ? 'Add to cart' : 'Out of stock'}
        </button>
        <button class="btn-secondary" id="buy-now" ${p.Stock <= 0 ? 'disabled' : ''}>
          Buy now
        </button>
      </div>

      <p id="cart-msg" class="cart-msg" hidden></p>
    </div>
  `;

  view.hidden = false;

  const mainImg = document.getElementById('main-img');
  view.querySelectorAll('.thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      if (mainImg) mainImg.src = btn.dataset.src;
      view.querySelectorAll('.thumb').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const addBtn = document.getElementById('add-to-cart');
  const buyBtn = document.getElementById('buy-now');
  const msgEl  = document.getElementById('cart-msg');

  addBtn?.addEventListener('click', async () => {
    const ok = await addToCart(p.ID, 1, addBtn, msgEl);
    if (ok) {
      msgEl.textContent = 'Added to cart.';
      msgEl.className = 'cart-msg ok';
      msgEl.hidden = false;
      setTimeout(() => { msgEl.hidden = true; }, 2500);
    }
  });

  buyBtn?.addEventListener('click', async () => {
    const ok = await addToCart(p.ID, 1, buyBtn, msgEl);
    if (ok) location.href = '/cart';
  });
}

async function addToCart(productId, quantity, btn, msgEl) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Adding…';
  if (msgEl) msgEl.hidden = true;

  try {
    const data = await cartFetch('/api/cart/items', {
      method: 'POST',
      body: { product_id: productId, quantity },
    });
    if (!data) return false; // redirected to login
    document.dispatchEvent(new CustomEvent('cart:update', { detail: data }));
    return true;
  } catch (ex) {
    console.error('add to cart:', ex.status, ex.message);
    if (msgEl) {
      let text = 'Could not add to cart. Please try again.';
      if (ex.status === 400) text = ex.message;
      else if (ex.status === 404) text = 'This product is no longer available.';
      msgEl.textContent = text;
      msgEl.className = 'cart-msg error';
      msgEl.hidden = false;
    }
    return false;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── utils ──
function showMsg(el, text) {
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
const escapeAttr = escapeHtml;

// ── go ──
loadProduct();
