// Requires: auth.js (accessToken, tryRefresh), header.js (cart:update event)

const cartError   = document.getElementById('cart-error');
const cartLoading = document.getElementById('cart-loading');
const cartEmpty   = document.getElementById('cart-empty');
const cartContent = document.getElementById('cart-content');
const cartWarning = document.getElementById('cart-warning');
const cartList    = document.getElementById('cart-list');
const cartSubtotal = document.getElementById('cart-subtotal');
const checkoutBtn = document.getElementById('checkout-btn');

let cart = null;

// ── authenticated fetch with refresh-retry ──
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
    if (!session) { location.href = '/login?next=/cart'; return null; }
  }

  let res = await doFetch();
  if (res.status === 401) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=/cart'; return null; }
    res = await doFetch();
  }

  let data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── load ──
async function loadCart() {
  try {
    const data = await cartFetch('/api/cart');
    if (!data) return;
    cart = data;
    renderCart();
  } catch (e) {
    console.error('load cart:', e.status, e.message);
    if (e.status === 401) { location.href = '/login?next=/cart'; return; }
    showMsg(cartError, 'Could not load your cart. Please try again.');
    cartLoading.hidden = true;
  }
}

function renderCart() {
  cartLoading.hidden = true;
  showMsg(cartError, '');

  if (!cart || !cart.items || cart.items.length === 0) {
    cartEmpty.hidden = false;
    cartContent.hidden = true;
    return;
  }

  cartEmpty.hidden = true;
  cartContent.hidden = false;

  cartWarning.hidden = !cart.has_unavailable;

  cartList.innerHTML = cart.items.map(item => lineHtml(item)).join('');
  cartSubtotal.textContent = `₦${cart.subtotal}`;
  checkoutBtn.disabled = cart.has_unavailable || cart.item_count === 0;

  // wire up buttons
  cartList.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', onAction);
  });
  cartList.querySelectorAll('[data-qty-input]').forEach(input => {
    input.addEventListener('change', onQtyInput);
    input.addEventListener('blur', onQtyInput);
  });
}

function lineHtml(item) {
  const img = item.image
    ? `<img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.name)}" loading="lazy">`
    : `<span class="muted small">No image</span>`;

  const unavailable = !item.available;
  const reason = item.reason || 'Unavailable';

  return `
    <li class="cart-line${unavailable ? ' unavailable' : ''}" data-id="${escapeAttr(item.product_id)}">
      <a href="/product?id=${encodeURIComponent(item.product_id)}" class="cart-line-img">
        ${img}
      </a>

      <div class="cart-line-info">
        <a href="/product?id=${encodeURIComponent(item.product_id)}" class="cart-line-name">
          ${escapeHtml(item.name)}
        </a>
        <span class="muted small">₦${escapeHtml(item.price)} each</span>
        ${unavailable ? `<span class="error small">${escapeHtml(reason)}</span>` : ''}
      </div>

      <div class="cart-line-qty">
        <button class="qty-btn" data-action="dec" data-id="${escapeAttr(item.product_id)}"
                ${item.quantity <= 1 || unavailable ? 'disabled' : ''}>−</button>
        <input type="number" min="1" max="${item.stock}"
               value="${item.quantity}"
               data-qty-input
               data-id="${escapeAttr(item.product_id)}"
               ${unavailable ? 'disabled' : ''}>
        <button class="qty-btn" data-action="inc" data-id="${escapeAttr(item.product_id)}"
                ${item.quantity >= item.stock || unavailable ? 'disabled' : ''}>+</button>
      </div>

      <div class="cart-line-subtotal">
        ₦${escapeHtml(item.subtotal)}
      </div>

      <button class="cart-line-remove" data-action="remove" data-id="${escapeAttr(item.product_id)}"
              aria-label="Remove">
        ×
      </button>
    </li>
  `;
}

// ── actions ──
async function onAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const item = cart.items.find(i => i.product_id === id);
  if (!item) return;

  try {
    if (action === 'inc') {
      if (item.quantity >= item.stock) return;
      await setQuantity(id, item.quantity + 1);
    } else if (action === 'dec') {
      if (item.quantity <= 1) return;
      await setQuantity(id, item.quantity - 1);
    } else if (action === 'remove') {
      await removeItem(id);
    }
  } catch (ex) {
    console.error(action, ex.status, ex.message);
    if (ex.status === 401) { location.href = '/login?next=/cart'; return; }
    if (ex.status === 404) {
      // item already gone server-side; refetch
      await loadCart();
      return;
    }
    showMsg(cartError, ex.message || 'Could not update cart.');
  }
}

async function onQtyInput(e) {
  const input = e.currentTarget;
  const id = input.dataset.id;
  const item = cart.items.find(i => i.product_id === id);
  if (!item) return;

  let qty = parseInt(input.value, 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  if (qty > item.stock) qty = item.stock;

  if (qty === item.quantity) {
    input.value = item.quantity;
    return;
  }

  try {
    await setQuantity(id, qty);
  } catch (ex) {
    console.error('set qty:', ex.status, ex.message);
    if (ex.status === 401) { location.href = '/login?next=/cart'; return; }
    input.value = item.quantity;
    showMsg(cartError, ex.message || 'Could not update quantity.');
  }
}

async function setQuantity(productId, quantity) {
  const data = await cartFetch(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: 'PUT',
    body: { quantity },
  });
  if (!data) return;
  cart = data;
  renderCart();
  document.dispatchEvent(new CustomEvent('cart:update', { detail: data }));
}

async function removeItem(productId) {
  const data = await cartFetch(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
  if (!data) return;
  cart = data;
  renderCart();
  document.dispatchEvent(new CustomEvent('cart:update', { detail: data }));
}

// ── checkout ──
checkoutBtn.addEventListener('click', () => {
  if (cart.has_unavailable) return;
  location.href = '/checkout';
});

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
loadCart();
