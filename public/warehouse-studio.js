/* Presentation-only Studio enhancements. Existing handlers/data remain authoritative. */
(() => {
  'use strict';
  const x = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const trash = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
  const documentRoot = document;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    documentRoot.querySelector('.studio-preview-tag')?.remove();
  }
  function polishButtons() {
    // Native selectedcontent keeps a long buyer on one line without clipping the picker arrow.
    const buyer = documentRoot.getElementById('e-buyer');
    if (buyer && window.CSS?.supports('appearance', 'base-select') && !buyer.querySelector('button')) {
      const button = documentRoot.createElement('button');
      button.type = 'button';
      button.appendChild(documentRoot.createElement('selectedcontent'));
      buyer.prepend(button);
    }
    const selectedContent = buyer?.querySelector('selectedcontent');
    const selectedLabel = buyer?.selectedOptions[0]?.textContent;
    if (selectedContent && selectedLabel && !selectedContent.textContent) selectedContent.textContent = selectedLabel;
    documentRoot.querySelectorAll('button').forEach(button => {
      if (button.dataset.studioIcon) return;
      const label = button.textContent.trim();
      const close = /^close(?: preview| dialog)?$/i.test(label);
      const remove = /^(remove|delete)(?: (?:item|product|line|order))?$/i.test(label);
      if (!close && !remove) return;
      // Inner content changes only; IDs, onclick/listeners, disabled and hidden state stay intact.
      button.dataset.studioIcon = close ? 'close' : 'trash';
      button.setAttribute('aria-label', button.getAttribute('aria-label') || label);
      button.title = button.title || label;
      button.classList.add(close ? 'studio-dialog-close' : 'studio-remove-button');
      button.innerHTML = close ? x : trash;
    });
  }
  document.querySelectorAll('#sidebar .nav-item').forEach(button => {
    const label = button.textContent.trim();
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('svg')?.setAttribute('aria-hidden', 'true');
  });
  const chooser = document.querySelector('.studio-workspace-menu');
  document.addEventListener('pointerdown', event => {
    if (chooser?.open && !chooser.contains(event.target)) chooser.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && chooser?.open) {
      chooser.open = false;
      chooser.querySelector('summary')?.focus();
    }
  });
  function markValidationAttempt(event) {
    const button = event.target.closest?.('#entrySubmitButton,#restockSubmitButton');
    if (button) button.closest('.page')?.classList.add('studio-validation-attempted');
  }
  document.addEventListener('pointerdown', markValidationAttempt, true);
  document.addEventListener('click', markValidationAttempt, true);
  polishButtons();
  new MutationObserver(polishButtons).observe(document.body, { childList: true, subtree: true });
})();
