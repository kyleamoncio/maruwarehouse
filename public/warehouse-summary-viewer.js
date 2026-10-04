/* Summary-only Studio PDF viewer. Canonical generation/download and all order documents stay unchanged. */
(() => {
  'use strict';
  const frame = document.getElementById('summaryPdfFrame');
  if (!frame) return;
  let libraryPromise;
  function library() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return libraryPromise ||= import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  const stage = document.createElement('div');
  stage.className = 'studio-summary-viewer';
  stage.hidden = true;
  stage.innerHTML = '<div class="studio-summary-tools"><span class="studio-summary-page-count" role="status"></span><div><button type="button" class="btn btn-secondary" data-summary-zoom="out" aria-label="Zoom out">−</button><span class="studio-summary-zoom">100%</span><button type="button" class="btn btn-secondary" data-summary-zoom="in" aria-label="Zoom in">+</button></div></div><div class="studio-summary-pages" aria-label="Summary PDF pages"></div>';
  frame.before(stage);
  const pages = stage.querySelector('.studio-summary-pages');
  let generation = 0, pdf = null, zoom = 1;
  async function render(ticket) {
    if (!pdf) return;
    const document = pdf;
    const fragment = window.document.createDocumentFragment();
    const width = Math.min(1152, stage.parentElement.clientWidth - 48) * zoom;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      if (ticket !== generation) return;
      const unscaled = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.max(0.2,width / unscaled.width)});
      const canvas = window.document.createElement('canvas');
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label',`Summary PDF page ${number} of ${document.numPages}`);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio === 1 ? null : [ratio,0,0,ratio,0,0]}).promise;
      if (ticket !== generation) return;
      const text = window.document.createElement("div");
      text.className = "studio-summary-text";
      text.id = `studio-summary-page-text-${number}`;
      const content = await page.getTextContent();
      text.textContent = content.items.map(item => item.str).join(" ");
      canvas.setAttribute("aria-describedby",text.id);
      fragment.append(canvas,text);
    }
    if (ticket !== generation) return;
    pages.replaceChildren(fragment);
    stage.querySelector('.studio-summary-page-count').textContent = `${document.numPages} ${document.numPages === 1 ? 'page' : 'pages'}`;
    stage.querySelector('.studio-summary-zoom').textContent = `${Math.round(zoom * 100)}%`;
    stage.hidden = false;
    frame.hidden = true;
  }
  async function load() {
    const ticket = ++generation;
    const src = frame.getAttribute('src');
    stage.hidden = true;
    frame.hidden = false;
    if (pdf) { pdf.destroy(); pdf = null; }
    if (!src || !src.startsWith('blob:')) return;
    stage.hidden = false;
    frame.hidden = true;
    pages.textContent = 'Preparing PDF…';
    stage.querySelector('.studio-summary-page-count').textContent = 'Loading PDF';
    try {
      const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
      const pdfjs = await library();
      const document = await pdfjs.getDocument({data:bytes}).promise;
      if (ticket !== generation) { document.destroy(); return; }
      pdf = document; zoom = 1;
      await render(ticket);
    } catch (error) {
      if (ticket === generation) { stage.hidden = true; frame.hidden = false; }
      console.warn('Studio Summary viewer used the original PDF fallback.', error.message);
    }
  }
  stage.addEventListener('click', async event => {
    const button = event.target.closest('[data-summary-zoom]');
    if (!button || !pdf) return;
    zoom = Math.min(2,Math.max(0.5,zoom + (button.dataset.summaryZoom === 'in' ? 0.1 : -0.1)));
    try { await render(++generation); } catch { /* Keep the last successfully rendered pages. */ }
  });
  new MutationObserver(load).observe(frame,{attributes:true,attributeFilter:['src']});
})();
