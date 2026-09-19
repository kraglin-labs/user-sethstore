const ordersError    = document.getElementById('orders-error');
const ordersLoading  = document.getElementById('orders-loading');
const ordersEmpty    = document.getElementById('orders-empty');
const ordersList     = document.getElementById('orders-list');
const ordersMoreWrap = document.getElementById('orders-more-wrap');
const ordersMoreBtn  = document.getElementById('orders-more');

const LIMIT = 20;
let offset = 0;

async function authFetch(path) {
  const doFetch = () => fetch(path, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!accessToken) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=/orders'; return null; }
  }

  let res = await doFetch();
  if (res.status === 401) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=/orders'; return null; }
    res = await doFetch();
  }

  if (!res.ok) {
    const err = new Error(`Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function loadOrders() {
  ordersMoreBtn.disabled = true;
  ordersMoreBtn.textContent = 'Loading…';

  try {
    const data = await authFetch(`/api/orders?limit=${LIMIT}&offset=${offset}`);
    if (!data) return;

    const orders = data.orders || [];
    appendOrders(orders);
    offset += orders.length;

    ordersLoading.hidden = true;
    ordersEmpty.hidden = offset > 0;
    ordersList.hidden = offset === 0;
    ordersMoreWrap.hidden = orders.length < LIMIT;
  } catch (e) {
    console.error('load orders:', e.status, e.message);
    if (e.status === 401) { location.href = '/login?next=/orders'; return; }
    showMsg(ordersError, 'Could not load your orders. Please try again.');
    ordersLoading.hidden = true;
  } finally {
    ordersMoreBtn.disabled = false;
    ordersMoreBtn.textContent = 'Load more';
  }
}

function appendOrders(orders) {
  const html = orders.map(o => `
    <li class="order-card">
      <a href="/order?id=${encodeURIComponent(o.id)}" class="order-card-link">
        <div class="order-card-head">
          <span class="order-code">${escapeHtml(o.order_code)}</span>
          <span class="status-pill status-${escapeAttr(o.status)}">${escapeHtml(o.status.replace(/_/g, ' '))}</span>
        </div>
        <div class="order-card-body">
          <span class="order-subtotal">₦${escapeHtml(o.subtotal)}</span>
          <span class="muted small">${formatDate(o.created_at)}</span>
        </div>
        <div class="order-card-foot">
          <span class="muted small">${escapeHtml(o.payment_method.replace(/_/g, ' '))}</span>
          <span class="order-arrow">→</span>
        </div>
      </a>
    </li>
  `).join('');
  ordersList.insertAdjacentHTML('beforeend', html);
}

ordersMoreBtn.addEventListener('click', loadOrders);

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch (_) { return iso; }
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
const escapeAttr = escapeHtml;

loadOrders();
