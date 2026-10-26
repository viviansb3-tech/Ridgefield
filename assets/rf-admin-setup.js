(() => {
  'use strict';
  const form = document.getElementById('adminSetupForm');
  const button = document.getElementById('setupSubmit');
  const message = document.getElementById('setupMessage');
  const token = location.hash.slice(1);
  // Remove the capability from browser history; keep it only in this page's memory.
  history.replaceState(null, '', location.pathname);
  if (!token) { button.disabled = true; message.textContent = 'Open the one-time setup link provided for this administrator account.'; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    const password = document.getElementById('setupPassword').value;
    if (password !== document.getElementById('setupConfirm').value) { message.textContent = 'The passwords do not match.'; return; }
    button.disabled = true; message.textContent = 'Setting up your account…';
    let created = false;
    try {
      const result = await window.RidgefieldBaas.api('/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      created = true;
      await window.RidgefieldBaas.signIn(result.email, password);
      form.reset(); location.replace('admin.html');
    } catch (error) {
      message.textContent = created ? 'Your password has been set. Continue to the sign-in page to sign in.' : error.message;
      if (!created) button.disabled = false;
    }
  });
})();
