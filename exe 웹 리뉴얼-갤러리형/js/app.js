(() => {
  // Project list page (index.html). Header, scroll progress, entrance motion and FAQ: common.js
  const hero = document.querySelector('.hero');
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Background layers drift slower than the page (stars: --hero-shift, orbital graphic: --glow-shift)
  const updateHeroParallax = () => {
    if (prefersReducedMotion || !hero) return;
    const y = window.scrollY;
    hero.style.setProperty('--hero-shift', `${Math.min(90, y * 0.13)}px`);
    hero.style.setProperty('--glow-shift', `${Math.min(55, y * 0.08)}px`);
  };
  // Hero signal morph (Figma 174:284 → 174:279 → 175:1168), scrubbed by the scroll:
  //   phase 1 — the spark above the title travels to the proof copy and opens into the orbit mark;
  //   phase 2 — the orbit swallows its satellite, the core swells and bursts out into the bottom rings.
  // Positions come from the static marks (hidden while this runs), so the path follows every breakpoint.
  const morph = hero?.querySelector('.hero-morph');
  const morphPart = (name) => morph?.querySelector(`.hero-morph-${name}`);
  const parts = { core: morphPart('core'), sat: morphPart('sat'), orbit: morphPart('orbit'), outer: morphPart('outer'), flash: morphPart('flash') };
  const anchors = { spark: hero?.querySelector('.hero-spark'), orbit: hero?.querySelector('.proof-orbit'), ring: hero?.querySelector('.hero-ring--lg') };
  // Orbit mark geometry around its ellipse centre; the satellite starts where Figma draws it (≈47° on the ellipse)
  const ORBIT = { rx: 29.27, ry: 12.6, tilt: -26.5, satAngle: 0.819 };
  const SAT_LAP = 4200; // ms per satellite lap while the orbit form is showing
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const span = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const backOut = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
  const curve = (p0, c, p1, t) => ({ x: lerp(lerp(p0.x, c.x, t), lerp(c.x, p1.x, t), t), y: lerp(lerp(p0.y, c.y, t), lerp(c.y, p1.y, t), t) });
  // Layout offsets (not rects) so the [data-animate] entrance transforms never shift the anchors
  const offsetIn = (element) => {
    let x = 0, y = 0;
    for (let node = element; node && node !== hero; node = node.offsetParent) { x += node.offsetLeft; y += node.offsetTop; }
    return { x, y };
  };
  let path = null;
  const measureMorph = () => {
    if (!morph || Object.values(anchors).some((anchor) => !anchor)) return;
    const spark = offsetIn(anchors.spark), orbit = offsetIn(anchors.orbit);
    const a = { x: spark.x + anchors.spark.offsetWidth / 2, y: spark.y + anchors.spark.offsetHeight / 2 };
    const b = { x: orbit.x + anchors.orbit.offsetWidth * (46.5 / 93.005), y: orbit.y + anchors.orbit.offsetHeight * (32.66 / 65.33) };
    // The rings are centred with translate (invisible to offsets) and never animate, so their rect is safe here
    const heroBox = hero.getBoundingClientRect(), ringBox = anchors.ring.getBoundingClientRect();
    const c = { x: ringBox.left - heroBox.left + ringBox.width / 2, y: ringBox.top - heroBox.top + ringBox.height / 2 };
    const top = heroBox.top + scrollY;
    const vh = innerHeight;
    // Scroll stops: orbit settles at ~55% of the viewport; the burst finishes as the rings reach the
    // viewport's vertical centre, so the whole swell-and-burst plays out mid-screen
    const orbitAt = Math.max(1, top + b.y - vh * 0.55);
    const burstFrom = orbitAt + vh * 0.08;
    const burstAt = Math.max(burstFrom + 200, top + c.y - vh * 0.5);
    path = { top, a, b, c, ab: { x: lerp(a.x, b.x, 0.85), y: lerp(a.y, b.y, 0.1) }, bc: { x: Math.min(b.x + 140, heroBox.width - 40), y: lerp(b.y, c.y, 0.6) }, orbitAt, burstFrom, burstAt };
  };
  // Satellite lap: a rAF loop advances its angle only while it is visible on the orbit, then stops
  let satSpin = 0, satLast = null, satLooping = false, satVisible = false;
  const satFrame = (now) => {
    if (!satVisible) { satLooping = false; satLast = null; return; }
    if (satLast !== null) satSpin += ((now - satLast) / SAT_LAP) * Math.PI * 2;
    satLast = now;
    updateMorph();
    requestAnimationFrame(satFrame);
  };
  const updateMorph = () => {
    if (!path) return;
    const y = scrollY;
    const t1 = smooth(span(y, 0, path.orbitAt));
    const t2 = span(y, path.burstFrom, path.burstAt);
    const pos = t2 > 0 ? curve(path.b, path.bc, path.c, smooth(t2)) : curve(path.a, path.ab, path.b, t1);
    // Phase 1: the orbit opens in the back half of the trip, swirling into its tilt
    const open = smooth(span(t1, 0.35, 1));
    // Phase 2: satellite absorbed → orbit rounds out and spins → core swells → flash + outer ring overshoot
    const absorb = smooth(span(t2, 0, 0.3));
    const round = smooth(span(t2, 0, 0.6));
    const swell = backOut(span(t2, 0.3, 0.8));
    const burst = span(t2, 0.5, 1);
    const ring = span(t2, 0.55, 1);
    const sat = open * (1 - absorb);
    const rx = lerp(ORBIT.rx * open, 46, round);
    const ry = lerp(ORBIT.ry * open, 46, round);
    const tilt = ORBIT.tilt - 90 * (1 - open) + 180 * round;
    // The satellite rides the orbit line (same ellipse, same tilt), drawn into the core as it is absorbed
    const angle = ORBIT.satAngle + satSpin;
    const tiltRad = (tilt * Math.PI) / 180;
    const ex = rx * Math.cos(angle), ey = ry * Math.sin(angle);
    parts.core.setAttribute('r', lerp(6, 34, swell).toFixed(2));
    parts.sat.setAttribute('cx', ((ex * Math.cos(tiltRad) - ey * Math.sin(tiltRad)) * (1 - absorb)).toFixed(2));
    parts.sat.setAttribute('cy', ((ex * Math.sin(tiltRad) + ey * Math.cos(tiltRad)) * (1 - absorb)).toFixed(2));
    parts.sat.setAttribute('r', (3 * sat).toFixed(2));
    parts.orbit.setAttribute('rx', rx.toFixed(2));
    parts.orbit.setAttribute('ry', ry.toFixed(2));
    parts.orbit.setAttribute('transform', `rotate(${tilt.toFixed(2)})`);
    parts.orbit.style.strokeWidth = String(lerp(1, 2, round));
    parts.orbit.style.opacity = String(open);
    parts.outer.setAttribute('r', lerp(46, 77, backOut(ring)).toFixed(2));
    parts.outer.style.opacity = String(clamp01(ring * 3));
    parts.flash.setAttribute('r', lerp(34, 220, easeOut(burst)).toFixed(2));
    parts.flash.style.opacity = String(0.6 * Math.sin(Math.PI * burst));
    // Figma's lime double glow (2px solid + 10px at 25%); off on the bare spark, flaring with the burst
    const glow = Math.max(open, t2 > 0 ? 1 : 0) * (1 + 1.6 * Math.sin(Math.PI * burst));
    morph.style.filter = glow ? `drop-shadow(0 0 ${(2 * glow).toFixed(2)}px rgba(228,242,34,${Math.min(1, glow).toFixed(2)})) drop-shadow(0 0 ${(10 * glow).toFixed(2)}px rgba(228,242,34,.25))` : 'none';
    morph.style.transform = `translate3d(${pos.x.toFixed(1)}px,${pos.y.toFixed(1)}px,0)`;
    // Keep the lap running only while the satellite is out and the mark is on screen
    const screenY = pos.y + path.top - y;
    satVisible = sat > 0.01 && screenY > -120 && screenY < innerHeight + 120;
    if (satVisible && !satLooping) { satLooping = true; requestAnimationFrame(satFrame); }
  };
  if (morph && !prefersReducedMotion) {
    measureMorph();
    if (path) {
      hero.classList.add('is-morphing');
      updateMorph();
      const remeasure = () => { measureMorph(); updateMorph(); };
      addEventListener('resize', remeasure);
      addEventListener('load', remeasure);
      document.fonts?.ready.then(remeasure);
    }
  }

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    requestAnimationFrame(() => { updateHeroParallax(); updateMorph(); ticking = false; });
    ticking = true;
  }, { passive: true });
  updateHeroParallax();

  const proof = document.querySelector('.hero-proof');
  let counted = false;
  const animateCounts = () => {
    if (counted || prefersReducedMotion) return;
    counted = true;
    document.querySelectorAll('[data-count]').forEach((element) => {
      const end = Number(element.dataset.count);
      const pad = Number(element.dataset.pad || 0);
      const start = performance.now();
      const duration = 850;
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        element.textContent = String(Math.round(end * eased)).padStart(pad, '0');
        if (t < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  };
  if ('IntersectionObserver' in window && proof) {
    new IntersectionObserver((entries, observer) => {
      if (entries.some((entry) => entry.isIntersecting)) { animateCounts(); observer.disconnect(); }
    }, { threshold: 0.28 }).observe(proof);
  }

  // Gallery: the featured case document and every grid card carry [data-project] and filter together.
  // Each card's h3 link is stretched over the card, so clicking anywhere opens its detail page.
  const cards = [...document.querySelectorAll('[data-project]')];
  const gridCards = cards.filter((card) => card.classList.contains('gallery-card'));
  const filterButtons = [...document.querySelectorAll('.filter-option')];
  const search = document.querySelector('#project-search');
  const resultCount = document.querySelector('#result-count');
  const emptyState = document.querySelector('#empty-state');
  const filters = { service: 'all', industry: 'all', status: 'all' };

  const updateProjects = () => {
    const query = search.value.trim().toLocaleLowerCase('ko');
    let visible = 0;
    cards.forEach((card) => {
      const service = filters.service === 'all' || card.dataset.service.split(' ').includes(filters.service);
      const industry = filters.industry === 'all' || card.dataset.industry === filters.industry;
      const status = filters.status === 'all' || card.dataset.status === filters.status;
      const text = !query || card.dataset.search.toLocaleLowerCase('ko').includes(query);
      card.hidden = !(service && industry && status && text);
      if (!card.hidden) visible += 1;
    });
    const isDefault = !query && Object.values(filters).every((value) => value === 'all');
    resultCount.textContent = isDefault ? '19' : String(visible);
    emptyState.hidden = visible > 0;
  };

  filterButtons.forEach((button) => button.addEventListener('click', () => {
    const group = button.dataset.group;
    const clickedActive = button.classList.contains('active');
    document.querySelectorAll(`[data-group="${group}"]`).forEach((item) => item.classList.remove('active'));
    if (group === 'service' && button.dataset.value === 'all') {
      filters.service = 'all'; button.classList.add('active');
    } else if (clickedActive) {
      filters[group] = 'all';
      if (group === 'service') document.querySelector('[data-group="service"][data-value="all"]').classList.add('active');
    } else {
      filters[group] = button.dataset.value; button.classList.add('active');
    }
    updateProjects();
  }));
  search.addEventListener('input', updateProjects);
  document.querySelector('.filter-reset').addEventListener('click', () => {
    Object.keys(filters).forEach((key) => { filters[key] = 'all'; });
    filterButtons.forEach((button) => button.classList.toggle('active', button.dataset.group === 'service' && button.dataset.value === 'all'));
    search.value = '';
    updateProjects();
  });

  // Industry chosen in the header sub-nav on another page arrives as ?industry=<value>
  const industryParam = new URLSearchParams(location.search).get('industry');
  if (industryParam) {
    filterButtons.find((button) => button.dataset.group === 'industry' && button.dataset.value === industryParam)?.click();
  }

  const list = document.querySelector('#project-list');
  const sort = document.querySelector('#sort-button');
  let alphabetical = false;
  sort.addEventListener('click', () => {
    alphabetical = !alphabetical;
    // The featured case stays on top; only the grid is reordered
    const ordered = [...gridCards].sort((a, b) => alphabetical
      ? a.dataset.name.localeCompare(b.dataset.name, 'ko')
      : gridCards.indexOf(a) - gridCards.indexOf(b));
    ordered.forEach((card) => list.append(card));
    sort.textContent = alphabetical ? '이름순 ▾' : '최신순 ▾';
  });

  const more = document.querySelector('#more-button');
  more.addEventListener('click', () => {
    more.textContent = '전체 프로젝트 준비 중';
    more.disabled = true;
    setTimeout(() => { more.textContent = '더 보기 · 12건'; more.disabled = false; }, 1400);
  });
})();
