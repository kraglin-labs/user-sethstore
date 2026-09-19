// Requires: auth.js (accessToken, tryRefresh), header.js (session bootstrap + auth:login event)

const accountError   = document.getElementById('account-error');
const accountLoading = document.getElementById('account-loading');
const accountBody    = document.getElementById('account-body');

const nameInput  = document.getElementById('full_name');
const emailInput = document.getElementById('email');

const addressForm   = document.getElementById('address-form');
const addressSave   = document.getElementById('address-save');
const addressStatus = document.getElementById('address-status');

let user = null;
let savedAddress = null;

// ── API helpers ──
async function authFetch(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

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
async function loadMe() {
  try {
    if (!accessToken) {
      const session = await tryRefresh();
      if (!session) {
        location.href = '/login';
        return;
      }
    }
    user = await authFetch('/api/me');
    renderUser();
    accountLoading.hidden = true;
    accountBody.hidden = false;
  } catch (e) {
    console.error('load /api/me:', e.status, e.message);
    if (e.status === 401) {
      location.href = '/login';
      return;
    }
    showMsg(accountError, 'Could not load your account. Please try again.');
    accountLoading.hidden = true;
  }
}

function renderUser() {
  nameInput.value  = user.full_name || '';
  emailInput.value = user.email || '';

  savedAddress = user.address || null;
  fillAddressForm(savedAddress);
}

function fillAddressForm(addr) {
  const a = addr || {};
  ['country', 'state', 'lga', 'town', 'street'].forEach(field => {
    addressForm.elements[field].value = a[field] || '';
  });
  updateAddressDirty();
}

// ── dirty tracking for address ──
function currentAddress() {
  const out = {};
  ['country', 'state', 'lga', 'town', 'street'].forEach(field => {
    out[field] = addressForm.elements[field].value.trim();
  });
  return out;
}

function addressFilled() {
  const a = currentAddress();
  return ['country', 'state', 'lga', 'town', 'street'].every(k => a[k].length > 0);
}

function addressChanged() {
  if (!savedAddress) return addressFilled();
  const a = currentAddress();
  return ['country', 'state', 'lga', 'town', 'street']
    .some(k => (a[k] || '') !== (savedAddress[k] || ''));
}

function updateAddressDirty() {
  addressSave.disabled = !addressFilled() || !addressChanged();
}

addressForm.addEventListener('input', () => {
  hideStatus(addressStatus);
  updateAddressDirty();
});

// ── submit: PUT /api/me/address ──
addressForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideStatus(addressStatus);
  showMsg(accountError, '');

  if (!addressFilled()) {
    showStatus(addressStatus, 'Please fill in every address field.', 'error');
    return;
  }

  addressSave.disabled = true;
  addressSave.textContent = 'Saving…';

  try {
    const data = await authFetch('/api/me/address', {
      method: 'PUT',
      body: currentAddress(),
    });

    savedAddress = data.address || currentAddress();
    user.address = savedAddress;
    updateAddressDirty();

    showStatus(addressStatus, 'Address saved.', 'ok');
    document.dispatchEvent(new CustomEvent('user:update', { detail: user }));
  } catch (ex) {
    console.error('save address:', ex.status, ex.message);
    if (ex.status === 400) {
      showStatus(addressStatus, ex.message || 'Invalid address.', 'error');
    } else if (ex.status === 401) {
      location.href = '/login';
    } else {
      showStatus(addressStatus, 'Could not save address. Please try again.', 'error');
    }
  } finally {
    addressSave.disabled = false;
    addressSave.textContent = 'Save address';
  }
});

// ── status helpers ──
function showStatus(el, text, kind = 'ok') {
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.className = `form-status ${kind}`;
}
function hideStatus(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
  el.className = 'form-status';
}
function showMsg(el, text) {
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}

// ── header integration ──
// header.js fires auth:login with the user. If we're already on /me,
// we don't need to wait for it — but if the page loads and header.js
// refreshes first, this keeps our state in sync.
document.addEventListener('auth:login', (e) => {
  if (!user) {
    user = e.detail;
    renderUser();
    accountLoading.hidden = true;
    accountBody.hidden = false;
  }
});

document.addEventListener('auth:logout', () => {
  location.href = '/login';
});

// ── delete account ──
const deleteBtn     = document.getElementById('delete-account');
const deleteModal   = document.getElementById('delete-modal');
const deleteForm    = document.getElementById('delete-form');
const deleteError   = document.getElementById('delete-error');
const deleteConfirm = document.getElementById('delete-confirm');

function openDeleteModal() {
  deleteError.hidden = true;
  deleteError.textContent = '';
  deleteForm.reset();
  deleteModal.hidden = false;
  deleteForm.elements.password.focus();
}

function closeDeleteModal() {
  deleteModal.hidden = true;
}

deleteBtn.addEventListener('click', openDeleteModal);

deleteModal.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', closeDeleteModal);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !deleteModal.hidden) closeDeleteModal();
});

deleteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  deleteError.hidden = true;
  deleteError.textContent = '';

  const password = deleteForm.elements.password.value;
  if (!password) {
    deleteError.textContent = 'Please enter your password.';
    deleteError.hidden = false;
    return;
  }

  deleteConfirm.disabled = true;
  deleteConfirm.textContent = 'Deleting…';

  try {
    await authFetch('/api/account/delete', {
      method: 'POST',
      body: { password },
    });
    // Success — clear local auth state and bounce to a "deleted" landing page
    accessToken = null;
    location.href = '/account/deleted';
  } catch (ex) {
    console.error('delete account:', ex.status, ex.message);
    if (ex.status === 403) {
      deleteError.textContent = 'Incorrect password.';
    } else if (ex.status === 401) {
      location.href = '/login';
      return;
    } else {
      deleteError.textContent = ex.message || 'Could not delete account. Please try again.';
    }
    deleteError.hidden = false;
    deleteConfirm.disabled = false;
    deleteConfirm.textContent = 'Delete account';
  }
});
// ── go ──
loadMe();
