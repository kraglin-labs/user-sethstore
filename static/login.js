// login.js — handles the "account scheduled for deletion → restore" flow.
// The login form itself is still driven by auth.js#initLogin.

const loginForm   = document.getElementById('login-form');
const loginErr    = document.getElementById('error');
const restorePanel = document.getElementById('restore-panel');
const restoreBtn  = document.getElementById('restore-btn');
const restoreMsg  = document.getElementById('restore-msg');
const restoreErr  = document.getElementById('restore-err');

// Watch the error element for the "scheduled for deletion" message.
// auth.js shows err.message verbatim when status is 403, so we can react to it.
const observer = new MutationObserver(() => {
  if (loginErr.hidden) return;
  const text = loginErr.textContent || '';
  if (/scheduled for deletion/i.test(text)) {
    restorePanel.hidden = false;
  }
});
observer.observe(loginErr, { childList: true, characterData: true, subtree: true });

restoreBtn.addEventListener('click', async () => {
  restoreMsg.hidden = true;
  restoreErr.hidden = true;

  // Grab the values the user just typed into the login form.
  const email    = loginForm.email.value.trim();
  const password = loginForm.password.value;

  if (!email || !password) {
    restoreErr.textContent = 'Enter your email and password above, then click restore.';
    restoreErr.hidden = false;
    return;
  }

  restoreBtn.disabled = true;
  restoreBtn.textContent = 'Restoring…';

  try {
    const res = await fetch('/api/account/restore', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    let data = {};
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    restoreMsg.textContent = 'Account restored — you can now log in.';
    restoreMsg.hidden = false;
    restorePanel.hidden = true;
    // Optionally pre-clear the error so the user sees the success message cleanly.
    loginErr.hidden = true;
    loginErr.textContent = '';
  } catch (ex) {
    console.error('restore:', ex.status, ex.message);
    if (ex.status === 401) {
      restoreErr.textContent = 'Incorrect email or password.';
    } else if (ex.status === 410) {
      restoreErr.textContent = 'This account has been permanently deleted and can no longer be restored.';
    } else if (ex.status === 400) {
      restoreErr.textContent = ex.message || 'Could not restore this account.';
    } else {
      restoreErr.textContent = 'Something went wrong. Please try again.';
    }
    restoreErr.hidden = false;
  } finally {
    restoreBtn.disabled = false;
    restoreBtn.textContent = 'Restore my account';
  }
});
