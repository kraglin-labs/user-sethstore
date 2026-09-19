const orderError    = document.getElementById('order-error');
const orderLoading  = document.getElementById('order-loading');
const orderBody     = document.getElementById('order-body');
const orderBanner   = document.getElementById('order-banner');
const orderCode     = document.getElementById('order-code');
const orderStatus   = document.getElementById('order-status');
const paymentPanel  = document.getElementById('order-payment-panel');
const orderItems    = document.getElementById('order-items');
const orderSubtotal = document.getElementById('order-subtotal');
const orderAddress  = document.getElementById('order-address');
const orderTimeline = document.getElementById('order-timeline');
const orderActions  = document.getElementById('order-actions');
const markPaidBtn   = document.getElementById('mark-paid');
const cancelBtn     = document.getElementById('cancel-order');

let order = null;
let pollTimer = null;
const POLL_MS = 45000;
const TERMINAL = new Set(['delivered', 'cancelled', 'rejected']);

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

  const here = encodeURIComponent(location.pathname + location.search);

  if (!accessToken) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=' + here; return null; }
  }

  let res = await doFetch();
  if (res.status === 401) {
    const session = await tryRefresh();
    if (!session) { location.href = '/login?next=' + here; return null; }
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
function getOrderId() {
  return new URLSearchParams(location.search).get('id');
}

async function loadOrder() {
  const id = getOrderId();
  if (!id) { showMsg(orderError, 'No order specified.'); return; }

  const here = encodeURIComponent(location.pathname + location.search);

  try {
    order = await authFetch(`/api/orders/${encodeURIComponent(id)}`);
    if (!order) return;
    renderOrder();
    orderLoading.hidden = true;
    orderBody.hidden = false;
    schedulePoll();
  } catch (e) {
    console.error('load order:', e.status, e.message);
    if (e.status === 401) { location.href = '/login?next=' + here; return; }
    showMsg(orderError, 'Could not load this order.');
    orderLoading.hidden = true;
  }
}

// ── render ──
function renderOrder() {
  document.title = `${order.order_code} — SethStore`;
  orderCode.textContent = order.order_code;

  orderStatus.textContent = order.status.replace(/_/g, ' ');
  orderStatus.className = `status-pill status-${order.status}`;

  orderItems.innerHTML = order.items.map(item => `
    <li class="checkout-item">
      <span class="checkout-item-qty">${item.quantity}×</span>
      <span class="checkout-item-name">${escapeHtml(item.name)}</span>
      <span class="checkout-item-subtotal">₦${escapeHtml(item.subtotal)}</span>
    </li>
  `).join('');
  orderSubtotal.textContent = `₦${order.subtotal}`;

  const a = order.shipping_address;
  orderAddress.innerHTML = `
    <p>${escapeHtml(a.street)}</p>
    <p>${escapeHtml(a.town)}, ${escapeHtml(a.lga)}</p>
    <p>${escapeHtml(a.state)}, ${escapeHtml(a.country)}</p>
  `;

  renderTimeline();
  renderPaymentPanel();
  renderActions();
  renderBanner();
}

function renderTimeline() {
  const t = order.timeline;
  const steps = [
    { label: 'Placed',    ts: t.created_at },
    { label: 'Approved',  ts: t.approved_at },
    { label: 'Shipped',   ts: t.shipped_at },
    { label: 'Delivered', ts: t.delivered_at },
  ];
  if (order.status === 'cancelled') steps.push({ label: 'Cancelled', ts: t.cancelled_at });
  if (order.status === 'rejected')  steps.push({ label: 'Rejected',  ts: t.rejected_at });

  orderTimeline.innerHTML = steps.map(step => `
    <li class="timeline-step${step.ts ? ' done' : ''}">
      <span class="timeline-dot"></span>
      <span class="timeline-label">${step.label}</span>
      <span class="timeline-time muted small">${step.ts ? formatDate(step.ts) : '—'}</span>
    </li>
  `).join('');
}

function renderPaymentPanel() {
  const { status, payment_method, order_code, subtotal, bank_details } = order;

  // Pending bank transfer with bank details from the server
  if (status === 'pending' && payment_method === 'bank_transfer' && bank_details) {
    paymentPanel.hidden = false;
    paymentPanel.innerHTML = `
      <h2>Payment instructions</h2>
      <p class="muted small">
        Transfer <strong>₦${escapeHtml(subtotal)}</strong> to the account below.
        Use <strong>${escapeHtml(order_code)}</strong> as the transfer narration.
      </p>
      <div class="bank-details">
        <div><span class="muted small">Bank</span><strong>${escapeHtml(bank_details.bank_name)}</strong></div>
        <div><span class="muted small">Account name</span><strong>${escapeHtml(bank_details.account_name)}</strong></div>
        <div><span class="muted small">Account number</span><strong>${escapeHtml(bank_details.account_number)}</strong></div>
        <div><span class="muted small">Amount</span><strong>₦${escapeHtml(subtotal)}</strong></div>
      </div>
      <p class="muted small" style="margin-top:1rem;">
        We've also emailed these details. Once you've transferred, click "I've paid" below.
      </p>
    `;
    return;
  }

  // Pending bank transfer, no bank details in response — fall back to email
  if (status === 'pending' && payment_method === 'bank_transfer' && !bank_details) {
    paymentPanel.hidden = false;
    paymentPanel.innerHTML = `
      <h2>Payment instructions</h2>
      <p>We've emailed you the bank details for order <strong>${escapeHtml(order_code)}</strong>.</p>
      <p class="muted small">Check your inbox (and spam folder). Once you've transferred, click "I've paid" below.</p>
    `;
    return;
  }

  // Awaiting confirmation — we're verifying the payment
  if (status === 'awaiting_confirmation') {
    paymentPanel.hidden = false;
    paymentPanel.innerHTML = `
      <h2>Payment</h2>
      <p>We're verifying your payment. This usually takes a few minutes.</p>
    `;
    return;
  }

  // Pay on delivery, not yet delivered
  if (payment_method === 'pay_on_delivery' && (status === 'pending' || status === 'approved' || status === 'shipped')) {
    paymentPanel.hidden = false;
    paymentPanel.innerHTML = `
      <h2>Pay on delivery</h2>
      <p>Have <strong>₦${escapeHtml(subtotal)}</strong> ready when your order arrives.</p>
    `;
    return;
  }

  paymentPanel.hidden = true;
  paymentPanel.innerHTML = '';
}

function renderActions() {
  let hasAction = false;

  if (order.status === 'pending' && order.payment_method === 'bank_transfer') {
    markPaidBtn.hidden = false;
    hasAction = true;
  } else {
    markPaidBtn.hidden = true;
  }

  if (order.status === 'pending') {
    cancelBtn.hidden = false;
    hasAction = true;
  } else {
    cancelBtn.hidden = true;
  }

  orderActions.hidden = !hasAction;
}

function renderBanner() {
  const placed = new URLSearchParams(location.search).get('placed');
  if (placed && order.status === 'pending') {
    orderBanner.className = 'order-banner ok';
    orderBanner.innerHTML = `Order <strong>${escapeHtml(order.order_code)}</strong> placed! Check your email for details.`;
    orderBanner.hidden = false;

    const url = new URL(location.href);
    url.searchParams.delete('placed');
    history.replaceState({}, '', url);
    return;
  }

  if (order.status === 'cancelled') {
    orderBanner.className = 'order-banner cancelled';
    orderBanner.innerHTML = `This order was cancelled${order.cancel_reason ? ': ' + escapeHtml(order.cancel_reason) : '.'}`;
    orderBanner.hidden = false;
    return;
  }
  if (order.status === 'rejected') {
    orderBanner.className = 'order-banner rejected';
    orderBanner.innerHTML = `This order was rejected${order.reject_reason ? ': ' + escapeHtml(order.reject_reason) : '.'}`;
    orderBanner.hidden = false;
    return;
  }

  orderBanner.hidden = true;
}

// ── actions ──
markPaidBtn.addEventListener('click', async () => {
  markPaidBtn.disabled = true;
  markPaidBtn.textContent = 'Marking…';
  try {
    order = await authFetch(`/api/orders/${encodeURIComponent(order.id)}/mark-paid`, { method: 'POST' });
    if (!order) return;
    renderOrder();
  } catch (ex) {
    console.error('mark paid:', ex.status, ex.message);
    if (ex.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return; }
    showMsg(orderError, ex.message || 'Could not mark as paid.');
  } finally {
    markPaidBtn.disabled = false;
    markPaidBtn.textContent = "I've paid";
  }
});

cancelBtn.addEventListener('click', async () => {
  const reason = prompt('Why are you cancelling? (optional)');
  if (reason === null) return;

  cancelBtn.disabled = true;
  cancelBtn.textContent = 'Cancelling…';
  try {
    order = await authFetch(`/api/orders/${encodeURIComponent(order.id)}/cancel`, {
      method: 'POST',
      body: { reason },
    });
    if (!order) return;
    renderOrder();
  } catch (ex) {
    console.error('cancel:', ex.status, ex.message);
    if (ex.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return; }
    showMsg(orderError, ex.message || 'Could not cancel order.');
  } finally {
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel order';
  }
});

// ── polling ──
function schedulePoll() {
  clearTimeout(pollTimer);
  if (TERMINAL.has(order.status)) return;
  pollTimer = setTimeout(async () => {
    try {
      const fresh = await authFetch(`/api/orders/${encodeURIComponent(order.id)}`);
      if (!fresh) return;
      // Only re-render if something meaningful changed
      if (fresh.status !== order.status || fresh.timeline.shipped_at !== order.timeline.shipped_at) {
        order = fresh;
        renderOrder();
      }
      schedulePoll();
    } catch (_) {
      schedulePoll();
    }
  }, POLL_MS);
}

// ── utils ──
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

// ── go ──
loadOrder();
