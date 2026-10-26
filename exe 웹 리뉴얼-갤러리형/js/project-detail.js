(() => {
  // Project detail page. Header, scroll progress, entrance motion and FAQ: common.js
  const sections = [...document.querySelectorAll('.case-section')];
  const tocLinks = [...document.querySelectorAll('.case-toc a')];

  // Scroll-spy: the section whose label has passed 35% of the viewport is "current" —
  // its TOC item gets the lime rule and its step badge turns lime (Figma: 01 state).
  const setActive = (section) => {
    sections.forEach((item) => item.classList.toggle('is-active', item === section));
    tocLinks.forEach((link) => {
      const on = link.hash === `#${section.id}`;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
    });
  };
  let current = null;
  const updateSpy = () => {
    if (!sections.length) return;
    const line = innerHeight * 0.35;
    const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let next = sections[0];
    sections.forEach((section) => {
      const label = section.querySelector('.case-section-label') || section;
      if (label.getBoundingClientRect().top <= line) next = section;
    });
    // At the very end of the article the last section may never reach the line
    const lastRect = sections[sections.length - 1].getBoundingClientRect();
    if (atBottom || lastRect.bottom <= innerHeight * 0.6) next = sections[sections.length - 1];
    if (next !== current) { current = next; setActive(next); }
  };
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    requestAnimationFrame(() => { updateSpy(); ticking = false; });
    ticking = true;
  }, { passive: true });
  addEventListener('resize', updateSpy, { passive: true });
  updateSpy();

  // Copy buttons (Sources): quote text or URL to the clipboard, label confirms for a moment
  const status = document.querySelector('[data-copy-status]');
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const field = Object.assign(document.createElement('textarea'), { value: text });
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      return ok;
    }
  };
  document.querySelectorAll('[data-copy], [data-copy-from]').forEach((button) => {
    const label = button.textContent;
    button.addEventListener('click', async () => {
      const source = button.dataset.copyFrom && document.querySelector(button.dataset.copyFrom);
      const text = source ? source.textContent.trim() : button.dataset.copy;
      const ok = await copyText(text);
      button.textContent = ok ? '복사됨' : '복사 실패';
      if (status) status.textContent = ok ? `${label} 완료` : `${label} 실패`;
      clearTimeout(button.copyTimer);
      button.copyTimer = setTimeout(() => { button.textContent = label; }, 1400);
    });
  });
})();
