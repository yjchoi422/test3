(() => {
  // Shared behaviour for every page: header sub-nav, scroll progress + header state,
  // [data-animate] entrance, FAQ accordion. Page scripts: app.js (list), project-detail.js (detail).
  const progress = document.querySelector('.scroll-progress span');
  const header = document.querySelector('.site-header');
  const subNav = document.querySelector('.sub-nav-panel');
  const subNavTriggers = [...document.querySelectorAll('[data-subnav]')];
  const subNavPanes = [...document.querySelectorAll('[data-subnav-pane]')];
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeSubNav = null;

  const closeSubNav = () => {
    if (!header || !subNav) return;
    header.classList.remove('is-subnav-open');
    subNav.setAttribute('aria-hidden', 'true');
    subNavTriggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    activeSubNav = null;
  };

  // One shared panel: moving between menus swaps only its content and animates the height.
  const openSubNav = (key) => {
    const pane = subNavPanes.find((item) => item.dataset.subnavPane === key);
    if (!header || !subNav || !pane || key === activeSubNav) return;
    const isSwap = activeSubNav !== null;
    subNavPanes.forEach((item) => {
      item.hidden = item !== pane;
      item.classList.remove('is-entering');
    });
    if (isSwap && !prefersReducedMotion) {
      void pane.offsetWidth;
      pane.classList.add('is-entering');
    }
    subNavTriggers.forEach((trigger) => trigger.setAttribute('aria-expanded', String(trigger.dataset.subnav === key)));
    const border = subNav.offsetHeight - subNav.clientHeight;
    subNav.style.height = `${pane.offsetHeight + border}px`;
    header.classList.add('is-subnav-open');
    subNav.setAttribute('aria-hidden', 'false');
    activeSubNav = key;
  };

  // Hover opens after 150ms; once a panel is open, moving to another menu swaps it right away.
  let openTimer;
  const cancelOpen = () => clearTimeout(openTimer);
  subNavTriggers.forEach((trigger) => {
    const key = trigger.dataset.subnav;
    trigger.addEventListener('mouseenter', () => {
      cancelOpen();
      if (activeSubNav) openSubNav(key);
      else openTimer = setTimeout(() => openSubNav(key), 150);
    });
    trigger.addEventListener('mouseleave', cancelOpen);
  });
  header?.addEventListener('mouseleave', () => { cancelOpen(); closeSubNav(); });
  header?.addEventListener('focusin', (event) => {
    const trigger = event.target.closest('[data-subnav]');
    if (trigger) openSubNav(trigger.dataset.subnav);
    else if (!subNav?.contains(event.target)) closeSubNav();
  });
  header?.addEventListener('focusout', (event) => {
    if (!header.contains(event.relatedTarget)) closeSubNav();
  });
  header?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !activeSubNav) return;
    cancelOpen();
    subNavTriggers.find((trigger) => trigger.dataset.subnav === activeSubNav)?.focus();
    closeSubNav();
  });

  // Industry links: on the list page apply the filter in place; elsewhere the link's
  // ?industry= parameter carries it to the list page (read by app.js).
  subNav?.querySelectorAll('[data-sub-filter]').forEach((link) => {
    link.addEventListener('click', () => {
      const option = document.querySelector(`.filter-option[data-group="industry"][data-value="${link.dataset.subFilter}"]`);
      if (option && !option.classList.contains('active')) option.click();
      closeSubNav();
    });
  });
  subNav?.querySelectorAll('a').forEach((link) => {
    if (link.hasAttribute('data-sub-filter')) return;
    link.addEventListener('click', closeSubNav);
  });

  const updateScroll = () => {
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    if (progress) progress.style.transform = `scaleX(${Math.min(1, y / max)})`;
    header?.classList.toggle('is-scrolled', y > 12);
  };
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    requestAnimationFrame(() => { updateScroll(); ticking = false; });
    ticking = true;
  }, { passive: true });
  updateScroll();

  const animated = document.querySelectorAll('[data-animate]');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const enterObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-inview');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    animated.forEach((element) => enterObserver.observe(element));
  }

  // Floating CTA border runner: SVG can't grade a stroke along its path, so the short lime line is built from
  // thin slices of the same dash. Slice i sits i steps further along the path (--k → negative animation delay)
  // and is more opaque, so the line reads as a head at 100% fading to a 15% tail. Lengths are in pathLength
  // units (the rect has pathLength="100"); a hair of overlap hides anti-aliasing seams between slices.
  const FAB_LINE = 15, FAB_SLICES = 16, FAB_TAIL_OPACITY = 0.15, FAB_SEAM = 0.08;
  document.querySelectorAll('.fab-stroke').forEach((svg) => {
    const base = svg.querySelector('rect');
    if (!base) return;
    const slice = FAB_LINE / FAB_SLICES;
    for (let i = 0; i < FAB_SLICES; i += 1) {
      const piece = i === 0 ? base : base.cloneNode(false);
      const dash = slice + FAB_SEAM;
      piece.style.strokeDasharray = `${dash} ${100 - dash}`;
      piece.style.opacity = String(FAB_TAIL_OPACITY + (1 - FAB_TAIL_OPACITY) * (i / (FAB_SLICES - 1)));
      piece.style.setProperty('--k', String((i * slice) / 100));
      piece.classList.toggle('is-cap', i === 0 || i === FAB_SLICES - 1);
      if (i) svg.append(piece);
    }
  });

  // FAQ accordion: one open item per list. The motion is all CSS on .faq-item.open (answer height,
  // text fade, icon turn); closed answers stay in the DOM so they can animate, made inert for keyboard/AT.
  document.querySelectorAll('.faq-item button').forEach((button) => button.addEventListener('click', () => {
    const item = button.closest('.faq-item');
    const willOpen = !item.classList.contains('open');
    item.parentElement.querySelectorAll('.faq-item').forEach((other) => {
      other.classList.remove('open');
      other.querySelector('button').setAttribute('aria-expanded', 'false');
      other.querySelector('.faq-answer').inert = true;
    });
    if (willOpen) {
      item.classList.add('open');
      button.setAttribute('aria-expanded', 'true');
      item.querySelector('.faq-answer').inert = false;
    }
  }));
})();
