// Requires: auth.js (accessToken, tryRefresh), header.js

const checkoutError    = document.getElementById('checkout-error');
const checkoutLoading  = document.getElementById('checkout-loading');
const checkoutBlocked  = document.getElementById('checkout-blocked');
const checkoutBody     = document.getElementById('checkout-body');
const checkoutItems    = document.getElementById('checkout-items');
const checkoutSubtotal = document.getElementById('checkout-subtotal');
const checkoutAddress  = document.getElementById('checkout-address');
const podOption        = document.getElementById('pod-option');
const podReason        = document.getElementById('pod-reason');
const placeBtn         = document.getElementById('place-order');
const placeError       = document.getElementById('place-error');

let cart = null;
let me   = null;

// ── auth fetch ──
async function authFetch(path, { method = 'GET', body } = {}) {
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
    if (!session) { location.href = '/login?next=/checkout'; return null; }
  }

  let res = await doFetch();
  if (res.status === 401) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=/checkout'; return null; }
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
async function load() {
  try {
    const [cartData, meData] = await Promise.all([
      authFetch('/api/cart'),
      authFetch('/api/me'),
    ]);
    if (!cartData || !meData) return;
    cart = cartData;
    me   = meData;

    if (!validate()) { checkoutLoading.hidden = true; return; }
    render();
    checkoutLoading.hidden = true;
    checkoutBody.hidden = false;
  } catch (e) {
    console.error('checkout load:', e.status, e.message);
    if (e.status === 401) { location.href = '/login?next=/checkout'; return; }
    showMsg(checkoutError, 'Could not load checkout. Please try again.');
    checkoutLoading.hidden = true;
  }
}

// ── validation ──
function validate() {
  const blockers = [];

  if (!cart || !cart.items || cart.items.length === 0) {
    blockers.push('Your cart is empty.');
  } else if (cart.has_unavailable) {
    blockers.push('Some items in your cart are no longer available. Remove them to continue.');
  }

  if (!me.address) {
    blockers.push('Please add a shipping address before checking out.');
  }

  if (blockers.length) {
    checkoutBlocked.innerHTML = blockers.map(b => `<p>${escapeHtml(b)}</p>`).join('');
    checkoutBlocked.hidden = false;
    checkoutBody.hidden = true;
    return false;
  }
  checkoutBlocked.hidden = true;
  return true;
}

// ── render ──
function render() {
  checkoutItems.innerHTML = cart.items.map(item => `
    <li class="checkout-item">
      <span class="checkout-item-qty">${item.quantity}×</span>
      <span class="checkout-item-name">${escapeHtml(item.name)}</span>
      <span class="checkout-item-subtotal">₦${escapeHtml(item.subtotal)}</span>
    </li>
  `).join('');

  checkoutSubtotal.textContent = `₦${cart.subtotal}`;

  const a = me.address;
  checkoutAddress.innerHTML = `
    <p>${escapeHtml(a.street)}</p>
    <p>${escapeHtml(a.town)}, ${escapeHtml(a.lga)}</p>
    <p>${escapeHtml(a.state)}, ${escapeHtml(a.country)}</p>
  `;

  const podInput = podOption.querySelector('input');
  if (cart.pod_available) {
    podInput.disabled = false;
    podOption.classList.remove('disabled');
    podReason.textContent = 'Have cash ready when your order arrives.';
  } else {
    podInput.disabled = true;
    podOption.classList.add('disabled');
    podReason.textContent = 'Not available for this order.';
  }
}

// ── place order ──
// UUID is generated once per page load and reused on retries, so the
// server's idempotency dedupes accidental double-submits.
const clientToken = (crypto.randomUUID && crypto.randomUUID()) || fallbackUuid();

placeBtn.addEventListener('click', async () => {
  placeError.hidden = true;
  showMsg(checkoutError, '');

  const method = document.querySelector('input[name="payment_method"]:checked').value;

  placeBtn.disabled = true;
  placeBtn.textContent = 'Placing order…';

  try {
    const order = await authFetch('/api/checkout', {
      method: 'POST',
      body: { client_token: clientToken, payment_method: method },
    });
    if (!order) return;

    document.dispatchEvent(new CustomEvent('cart:update', {
      detail: { item_count: 0 },
    }));

    location.href = `/order?id=${encodeURIComponent(order.id)}&placed=1`;
  } catch (ex) {
    console.error('place order:', ex.status, ex.message);
    if (ex.status === 401) { location.href = '/login?next=/checkout'; return; }
    placeError.textContent = ex.message || 'Could not place order. Please try again.';
    placeError.hidden = false;
    placeBtn.disabled = false;
    placeBtn.textContent = 'Place order';
  }
});

// ── utils ──
function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function showMsg(el, text) {
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ── go ──
load();
