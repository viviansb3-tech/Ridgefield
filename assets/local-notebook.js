(() => {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  if (!local) return;
  const origin = 'http://127.0.0.1:36424';
  const paths = new Set(['/local-school','/ridgefield/login','/ridgefield/portal','/ridgefield/admin','/ridgefield/records','/subjects']);
  document.querySelectorAll('[data-notebook-path]').forEach(link => {
    if (!paths.has(link.dataset.notebookPath)) return;
    link.href = origin + link.dataset.notebookPath;
    link.hidden = false;
  });
  const message = document.getElementById('mathConnection');
  if (message) message.textContent = 'Open the mathematics platform running on this device. Use your approved notebook account; keep the local notebook server running.';
  const status = document.getElementById('mathStatus');
  if (status) status.textContent = 'Local notebook links available';
})();
