let accessToken = null;
let verifyToken = null;
let signupEmail = null;

// ── session ──
// Used by header.js to silently refresh the access token on every page load.
let refreshPromise = null;

async function tryRefresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      accessToken = data.access_token;
      return data;
    } catch (_) {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function gotoVerify(token, email) {
  location.href = '/verify#' + encodeURIComponent(token) + '&' + encodeURIComponent(email);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/auth' + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
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

function showMsg(el, text) {
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('signup-form')) initSignup();
  if (document.getElementById('verify-form')) initVerify();
  if (document.getElementById('login-form')) initLogin();
});

function initSignup() {
  const form = document.getElementById('signup-form');
  const err = document.getElementById('error');
  const btn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(err, '');
    btn.disabled = true;
    btn.textContent = 'Sending code…';

    try {
      const data = await api('/signup', {
        method: 'POST',
        body: {
          email: form.email.value.trim(),
          password: form.password.value,
          full_name: form.full_name.value.trim(),
        },
      });
      verifyToken = data.verify_token;
      signupEmail = form.email.value.trim();
      gotoVerify(verifyToken, signupEmail);
    } catch (ex) {
      console.error('signup failed:', ex.status, ex.message);
      if (ex.status === 409) {
        showMsg(err, 'An account with this email already exists.');
      } else if (ex.status === 502) {
        showMsg(err, "We couldn't send the code. Please try again.");
      } else if (ex.status === 400) {
        showMsg(err, ex.message);
      } else {
        showMsg(err, 'Something went wrong, please try again.');
      }
      btn.disabled = false;
      btn.textContent = 'Sign up';
    }
  });
}

function initVerify() {
  const form = document.getElementById('verify-form');
  const err = document.getElementById('error');
  const btn = document.getElementById('submit-btn');

  const hash = location.hash.slice(1);
  const [token, email] = hash.split('&').map(decodeURIComponent);

  if (!token || !email) {
    location.replace('/signup');
    return;
  }
  verifyToken = token;
  signupEmail = email;
  document.getElementById('email-display').textContent = email;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(err, '');
    btn.disabled = true;
    btn.textContent = 'Verifying…';

    try {
      await api('/verify', {
        method: 'POST',
        body: { token: verifyToken, code: form.code.value.trim() },
      });
      verifyToken = null;
      location.href = '/login?verified=1';
    } catch (ex) {
      console.error('verify failed:', ex.status, ex.message);
      if (ex.status === 401) {
        showMsg(err, 'Session expired. Please use "Forgot password" to continue.');
      } else if (ex.status === 429) {
        showMsg(err, 'Too many attempts. Request a new code.');
      } else {
        showMsg(err, 'Code is wrong or expired. Request a new one.');
      }
      btn.disabled = false;
      btn.textContent = 'Verify';
    }
  });
}

function initLogin() {
  const form = document.getElementById('login-form');
  const err = document.getElementById('error');
  const msg = document.getElementById('message');
  const btn = document.getElementById('submit-btn');

  if (new URLSearchParams(location.search).get('verified')) {
    showMsg(msg, 'Email verified — you can now log in.');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(err, '');
    showMsg(msg, '');
    btn.disabled = true;
    btn.textContent = 'Logging in…';

    try {
      const data = await api('/login', {
        method: 'POST',
        body: {
          email: form.email.value.trim(),
          password: form.password.value,
        },
      });
      accessToken = data.access_token;
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && next.startsWith('/') ? next : '/';
     
    } catch (ex) {
      console.error('login failed:', ex.status, ex.message);
      if (ex.status === 401) {
        showMsg(err, 'Invalid email or password.');
      } else if (ex.status === 403) {
        showMsg(err, ex.message);
      } else {
        showMsg(err, 'Something went wrong, please try again.');
      }
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });
}
