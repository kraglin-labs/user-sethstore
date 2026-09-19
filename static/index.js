// ── state ──
let allProducts = [];
let offset = 0;
const LIMIT = 20;
let searchQuery = '';

// ── DOM refs ──
const welcome      = document.getElementById('welcome');
const grid         = document.getElementById('product-grid');
const shopError    = document.getElementById('shop-error');
const loadMoreWrap = document.getElementById('load-more-wrap');
const loadMoreBtn  = document.getElementById('load-more');

// ── header events ──
document.addEventListener('auth:login', (e) => {
  const user = e.detail;
  welcome.innerHTML = `Hi, <strong>${escapeHtml(user.full_name)}</strong>`;
  welcome.hidden = false;
});

document.addEventListener('auth:logout', () => {
  welcome.hidden = true;
  welcome.textContent = '';
});

document.addEventListener('search:query', (e) => {
  searchQuery = e.detail;
  renderGrid();
});

document.addEventListener('search:clear', () => {
  searchQuery = '';
  renderGrid();
});

// ── API helper ──
async function apiGet(path) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(path, { credentials: 'include', headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── products ──
async function loadProducts() {
  showMsg(shopError, '');
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = 'Loading…';
  try {
    const data = await apiGet(`/api/products?limit=${LIMIT}&offset=${offset}`);
    const products = data.products || [];
    allProducts = allProducts.concat(products);
    offset += products.length;
    loadMoreWrap.hidden = products.length < LIMIT;
    renderGrid();
  } catch (e) {
    console.error(e);
    showMsg(shopError, 'Could not load products. Please try again.');
  } finally {
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load more';
  }
}

function visibleProducts() {
  if (!searchQuery) return allProducts;
  const q = searchQuery.toLowerCase();
  return allProducts.filter(p =>
    (p.Name || '').toLowerCase().includes(q) ||
    (p.Description || '').toLowerCase().includes(q) ||
    (p.Category || '').toLowerCase().includes(q)
  );
}

function renderGrid() {
  const items = visibleProducts();
  if (items.length === 0) {
    grid.innerHTML = `<p class="center muted" style="grid-column:1/-1;padding:3rem 0;">
      ${searchQuery ? 'No products match your search.' : 'No products yet.'}
    </p>`;
    return;
  }
  grid.innerHTML = items.map(p => `
    <a class="product-card" href="/product?id=${encodeURIComponent(p.ID)}">
      <div class="img-wrap">
        ${p.Images && p.Images.length
          ? `<img src="${escapeAttr(p.Images[0])}" alt="${escapeAttr(p.Name)}" loading="lazy">`
          : 'No image'}
      </div>
      <div class="body">
        <span class="name">${escapeHtml(p.Name)}</span>
        <span class="price">₦${escapeHtml(p.Price)}</span>
        <span class="meta">${escapeHtml(p.Category || '')}</span>
        <span class="meta ${p.Stock > 0 ? 'stock-ok' : 'stock-out'}">
          ${p.Stock > 0 ? `${p.Stock} in stock` : 'Out of stock'}
        </span>
      </div>
    </a>
  `).join('');
}

loadMoreBtn.addEventListener('click', loadProducts);

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
loadProducts();
