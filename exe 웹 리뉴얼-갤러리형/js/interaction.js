(() => {
  // Signal · Pull · Act — every hover target opens a lens: lime fill + black content
  // (lime targets invert to black fill + lime content). One rAF loop, no libraries.
  // data-cursor="signal": lens + magnet pull + pop + press (small standalone buttons/links)
  // data-cursor="lens":   lens only (cards, filters, FAQ, sub-menu links — no pull for click accuracy)
  const DOT = 12, LENS_MIN = 96, LENS_MAX = 128, LENS_VW = 6.667;
  const FOLLOW_DOT = 0.2, FOLLOW_LENS = 0.14, FOLLOW_PULL = 0.18;
  const PULL_SIGNAL = { k: 0.22, x: 12, y: 8 };
  const SPRING = { stiffness: 0.12, damping: 0.72 };
  const EASE_EMPHASIS = 'cubic-bezier(.16,1,.3,1)', EASE_STANDARD = 'cubic-bezier(.2,.7,.2,1)';
  const T_OPEN = 420, T_CLOSE = 240, T_POP = 360, T_PRESS = 120, T_RELEASE = 240;
  const LIME = '#E4F222', INK = '#0F1217', ON_DARK = '#F2F4F7';
  const LIME_RGB = 'rgb(228, 242, 34)';
  const DISABLE_BELOW = 900;
  const PRESS_SCALE = 0.96, PRESS_LENS = 0.88;

  const root = document.documentElement;
  const mqPointer = matchMedia('(hover: hover) and (pointer: fine)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const DARK_CONTEXT = '[data-cursor-theme="dark"], [data-surface="dark"], .site-header, .hero, .contact, .site-footer';
  const LIGHT_INSIDE_DARK = '.sub-nav-panel';
  const NATIVE_CURSOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  // Layout-affecting computed styles copied onto every node of the lens copy (colours come from interaction.css)
  const LAYOUT_PROPS = ['display', 'position', 'top', 'right', 'bottom', 'left', 'boxSizing',
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle', 'borderRadius',
    'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis', 'order',
    'alignItems', 'alignSelf', 'alignContent', 'justifyContent', 'justifyItems', 'justifySelf', 'rowGap', 'columnGap',
    'gridTemplateColumns', 'gridTemplateRows', 'gridColumnStart', 'gridColumnEnd', 'gridRowStart', 'gridRowEnd', 'gridAutoFlow',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontFeatureSettings', 'fontVariantNumeric',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textAlign', 'textTransform', 'textIndent',
    'whiteSpace', 'wordBreak', 'overflowWrap', 'verticalAlign', 'overflow', 'textOverflow', 'objectFit',
    'transform', 'transformOrigin'];

  // CSS cubic-bezier as a JS easing function (used for the lens radius tween)
  const bezier = (x1, y1, x2, y2) => {
    const at = (t, p1, p2) => ((1 - 3 * p2 + 3 * p1) * t * t * t) + ((3 * p2 - 6 * p1) * t * t) + (3 * p1 * t);
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i += 1) {
        const v = at(t, x1, x2);
        if (Math.abs(v - x) < 1e-4) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return at(t, y1, y2);
    };
  };
  const toEase = (css) => bezier(...css.match(/[\d.]+/g).map(Number));
  const easeEmphasis = toEase(EASE_EMPHASIS);
  const easeStandard = toEase(EASE_STANDARD);
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  const lensRadius = () => Math.min(LENS_MAX, Math.max(LENS_MIN, innerWidth * LENS_VW / 100)) / 2;

  let enabled = false;
  let els = null;
  let raf = 0;
  let scrollDirty = false;
  let active = null;      // element under the cursor: { el, type }
  let lensTarget = null;  // element copied into the lens: { el, box, w, h, cs }
  let pressed = null;     // { el, anim }
  const mouse = { x: -100, y: -100, seen: false };
  const dot = { x: -100, y: -100 };
  const lens = { x: -100, y: -100, r: 0, tween: null };
  const applied = new Map();  // el -> current pull translate { x, y }
  const springs = new Map();  // el -> { x, y, vx, vy } returning to 0
  const ownAnimations = new Set();

  const kick = () => { if (!raf && enabled) raf = requestAnimationFrame(frame); };
  const setPull = (el, x, y) => {
    applied.set(el, { x, y });
    el.style.translate = x || y ? `${x}px ${y}px` : '';
  };
  const track = (anim) => {
    ownAnimations.add(anim);
    anim.addEventListener('finish', () => ownAnimations.delete(anim));
    anim.addEventListener('cancel', () => ownAnimations.delete(anim));
    return anim;
  };
  const tweenLens = (to, dur, ease, done) => {
    lens.tween = { from: lens.r, to, start: performance.now(), dur, ease, done };
    kick();
  };

  const pop = (el) => track(el.animate(
    [{ scale: 1 }, { scale: 1.04, offset: 0.35 }, { scale: 0.98, offset: 0.7 }, { scale: 1 }],
    { duration: T_POP, easing: 'ease-out' },
  ));

  // Structural copy: every node becomes a plain span/img/svg carrying the original's computed layout,
  // so nested grids/flex rows (cards, filters) line up without page classes, ids or focusable tags.
  const copyTree = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const cs = getComputedStyle(node);
    if (cs.display === 'none') return null;
    let copy;
    if (node.matches('img')) {
      copy = document.createElement('img');
      copy.src = node.currentSrc || node.src;
      copy.alt = '';
    } else if (node.matches('svg')) {
      copy = node.cloneNode(true);
      copy.removeAttribute('id');
    } else {
      copy = document.createElement('span');
      node.childNodes.forEach((child) => { const c = copyTree(child); if (c) copy.append(c); });
    }
    LAYOUT_PROPS.forEach((prop) => { copy.style[prop] = cs[prop]; });
    // Native buttons centre their content vertically even as block/inline-block; reproduce that on the span
    if (node.matches('button') && !/flex|grid/.test(cs.display)) {
      copy.style.display = cs.display.startsWith('inline') ? 'inline-flex' : 'flex';
      copy.style.flexDirection = 'column';
      copy.style.justifyContent = 'center';
      copy.style.alignItems = { center: 'center', right: 'flex-end', end: 'flex-end' }[cs.textAlign] || 'flex-start';
    }
    return copy;
  };

  const isLimeSurface = (el) => el.dataset.cursorLens === 'ink' || el.dataset.cursorTheme === 'light'
    || getComputedStyle(el).backgroundColor === LIME_RGB;

  // (Re)build the lens copy at the target's current size — also called when the target resizes (card expand)
  const buildCopy = (el, size) => {
    const box = copyTree(el);
    if (!box) return null;
    // Fractional size (offsetWidth rounds down and can wrap the copy); the pop starts at scale 1
    const { width: w, height: h } = size || el.getBoundingClientRect();
    box.className = 'exe-lens__label';
    Object.assign(box.style, {
      // the root's own transform is already in its measured rect; children keep theirs (e.g. the FAQ × turn)
      position: 'absolute', top: '0px', left: '0px', right: 'auto', bottom: 'auto', margin: '0px', transform: 'none',
      width: `${w}px`, height: `${h}px`, minWidth: '0px', maxWidth: 'none', minHeight: '0px', maxHeight: 'none',
    });
    els.clone.replaceChildren(box);
    return { box, w, h };
  };

  const openLens = (el) => {
    const copy = buildCopy(el);
    if (!copy) return;
    lensTarget = { el, ...copy, cs: getComputedStyle(el) };

    const ink = isLimeSurface(el);
    els.lens.classList.toggle('is-ink', ink);
    els.lens.style.setProperty('--lens-fill', ink ? INK : LIME);
    els.lens.style.setProperty('--lens-ink', ink ? LIME : INK);
    if (lens.r === 0) { lens.x = mouse.x; lens.y = mouse.y; }
    tweenLens(lensRadius(), T_OPEN, easeEmphasis);
  };

  const enter = (el) => {
    const type = el.dataset.cursor === 'signal' ? 'signal' : 'lens';
    springs.delete(el);
    active = { el, type };
    if (type === 'signal') {
      if (!applied.has(el)) applied.set(el, { x: 0, y: 0 });
      pop(el);
    }
    els.cursor.classList.add('is-lens');
    openLens(el);
    kick();
  };

  const release = () => {
    if (!pressed) return;
    const { el, anim } = pressed;
    pressed = null;
    if (anim) {
      track(el.animate([{ scale: PRESS_SCALE }, { scale: 1 }], { duration: T_RELEASE, easing: EASE_EMPHASIS }));
      anim.cancel();
    }
    if (active && active.el === el) tweenLens(lensRadius(), T_RELEASE, easeEmphasis);
    kick();
  };

  const leave = () => {
    if (!active) return;
    const { el, type } = active;
    if (pressed && pressed.el === el) release();
    if (type === 'signal') {
      const pull = applied.get(el) || { x: 0, y: 0 };
      springs.set(el, { x: pull.x, y: pull.y, vx: 0, vy: 0 });
    }
    const closing = lensTarget;
    tweenLens(0, T_CLOSE, easeStandard, () => {
      if (lensTarget !== closing) return;
      els.clone.replaceChildren();
      lensTarget = null;
    });
    els.cursor.classList.remove('is-lens');
    active = null;
    kick();
  };

  // Decide context and target from the element under the pointer (mouseover / scroll only, never per frame)
  const evaluate = (target) => {
    if (!(target instanceof Element)) return;
    els.cursor.classList.toggle('is-native', !!target.closest(NATIVE_CURSOR));
    const onDark = !!target.closest(DARK_CONTEXT) && !target.closest(LIGHT_INSIDE_DARK);
    els.cursor.classList.toggle('is-on-dark', onDark);
    els.ring.classList.toggle('is-on-dark', onDark);
    const next = target.closest('[data-cursor]');
    if (next === (active && active.el)) return;
    leave();
    if (next) enter(next);
  };

  const frame = (now) => {
    raf = 0;
    let busy = false;

    if (scrollDirty) {
      scrollDirty = false;
      if (mouse.seen) evaluate(document.elementFromPoint(mouse.x, mouse.y));
    }

    // Read first, before any write: the lens target's rect, once per frame
    let lensBase = null;
    if (lensTarget) {
      const { el } = lensTarget;
      const r = el.getBoundingClientRect();
      const pull = applied.get(el) || { x: 0, y: 0 };
      lensBase = { x: r.left + r.width / 2 - pull.x, y: r.top + r.height / 2 - pull.y };
      if (active && active.el === el && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) leave();
      // Rebuild the copy when the target resizes (card expanding) or something inside it is
      // transitioning (FAQ icon turning), so the lens shows the same frame as the page
      const unscaled = lensTarget.cs.scale === 'none' || lensTarget.cs.scale === '1';
      const animating = el.getAnimations({ subtree: true }).some((anim) => !ownAnimations.has(anim));
      const resized = Math.abs(r.width - lensTarget.w) > 0.5 || Math.abs(r.height - lensTarget.h) > 0.5;
      if (unscaled && (resized || animating)) {
        const copy = buildCopy(el, r);
        if (copy) Object.assign(lensTarget, copy);
      }
      if (animating) busy = true;
    }

    // Dot
    dot.x += (mouse.x - dot.x) * FOLLOW_DOT;
    dot.y += (mouse.y - dot.y) * FOLLOW_DOT;
    if (Math.abs(mouse.x - dot.x) + Math.abs(mouse.y - dot.y) > 0.1) busy = true;
    else { dot.x = mouse.x; dot.y = mouse.y; }
    els.cursor.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0)`;

    // Pull toward the cursor (signal targets only)
    if (active && active.type === 'signal' && lensBase && lensTarget.el === active.el) {
      const { el } = active;
      const goalX = clamp((mouse.x - lensBase.x) * PULL_SIGNAL.k, PULL_SIGNAL.x);
      const goalY = clamp((mouse.y - lensBase.y) * PULL_SIGNAL.k, PULL_SIGNAL.y);
      const cur = applied.get(el);
      const x = cur.x + (goalX - cur.x) * FOLLOW_PULL;
      const y = cur.y + (goalY - cur.y) * FOLLOW_PULL;
      if (Math.abs(goalX - x) + Math.abs(goalY - y) > 0.05) busy = true;
      setPull(el, x, y);
    }

    // Spring back released elements
    springs.forEach((s, el) => {
      s.vx = (s.vx - s.x * SPRING.stiffness) * SPRING.damping;
      s.vy = (s.vy - s.y * SPRING.stiffness) * SPRING.damping;
      s.x += s.vx;
      s.y += s.vy;
      if (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.vx) + Math.abs(s.vy) < 0.05) {
        springs.delete(el);
        applied.delete(el);
        el.style.translate = '';
      } else {
        setPull(el, s.x, s.y);
        busy = true;
      }
    });

    // Lens: centre follows the cursor, the copy follows the target's final position this frame
    if (lens.tween) {
      const t = Math.min(1, (now - lens.tween.start) / lens.tween.dur);
      lens.r = lens.tween.from + (lens.tween.to - lens.tween.from) * lens.tween.ease(t);
      if (t >= 1) {
        const { done } = lens.tween;
        lens.tween = null;
        if (done) done();
      } else busy = true;
    }
    if (lens.r > 0) {
      lens.x += (mouse.x - lens.x) * FOLLOW_LENS;
      lens.y += (mouse.y - lens.y) * FOLLOW_LENS;
      if (Math.abs(mouse.x - lens.x) + Math.abs(mouse.y - lens.y) > 0.1) busy = true;
    }
    els.lens.style.clipPath = `circle(${lens.r}px at ${lens.x}px ${lens.y}px)`;
    // Stroke ring: same circle as the clip (border drawn inside, so its outer edge is the lens edge)
    els.ring.style.width = els.ring.style.height = `${lens.r * 2}px`;
    els.ring.style.transform = `translate3d(${lens.x - lens.r}px, ${lens.y - lens.r}px, 0)`;
    els.ring.classList.toggle('is-visible', lens.r > 1);
    if (lensTarget && lensBase) {
      const pull = applied.get(lensTarget.el) || { x: 0, y: 0 };
      lensTarget.box.style.translate = `${lensBase.x + pull.x - lensTarget.w / 2}px ${lensBase.y + pull.y - lensTarget.h / 2}px`;
      // translate/transform offsets are already in the measured centre; only scale changes the size
      const { scale } = lensTarget.cs;
      lensTarget.box.style.scale = scale === 'none' ? '' : scale;
      if (scale !== 'none' && scale !== '1') busy = true;
    }
    if (active && active.el.getAnimations().some((anim) => ownAnimations.has(anim))) busy = true;

    if (busy) kick();
  };

  const onMove = (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    if (!mouse.seen) {
      mouse.seen = true;
      dot.x = mouse.x; dot.y = mouse.y;
      lens.x = mouse.x; lens.y = mouse.y;
    }
    els.cursor.classList.remove('is-out');
    kick();
  };
  const onOver = (event) => evaluate(event.target);
  const onOut = (event) => {
    if (event.relatedTarget) return;
    els.cursor.classList.add('is-out');
    leave();
  };
  const onDown = (event) => {
    if (!active || event.button !== 0 || !active.el.contains(event.target)) return;
    const { el, type } = active;
    let anim = null;
    if (type === 'signal') {
      ownAnimations.forEach((a) => { if (a.effect && a.effect.target === el) a.cancel(); });
      anim = track(el.animate([{ scale: PRESS_SCALE }], { duration: T_PRESS, easing: EASE_STANDARD, fill: 'forwards' }));
    }
    pressed = { el, anim };
    tweenLens(lensRadius() * PRESS_LENS, T_PRESS, easeStandard);
  };
  const onScroll = () => { scrollDirty = true; kick(); };
  const onTransition = (event) => { if (lensTarget && lensTarget.el.contains(event.target)) kick(); };
  const onResize = () => {
    if (!sync() || !active) return;
    if (!lens.tween) lens.r = lensRadius();
    kick();
  };

  const enable = () => {
    const cursor = document.createElement('div');
    cursor.className = 'exe-cursor is-out';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<span class="exe-cursor__dot"></span>';
    const lensEl = document.createElement('div');
    lensEl.className = 'exe-lens';
    lensEl.setAttribute('aria-hidden', 'true');
    lensEl.innerHTML = '<div class="exe-lens__fill"></div><div class="exe-lens__clone"></div>';
    const ring = document.createElement('div');
    ring.className = 'exe-lens-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(cursor, lensEl, ring);
    els = { cursor, lens: lensEl, ring, clone: lensEl.querySelector('.exe-lens__clone') };
    root.classList.add('has-exe-cursor');
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('transitionrun', onTransition, { passive: true });
    enabled = true;
  };

  const disable = () => {
    enabled = false;
    cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseover', onOver);
    document.removeEventListener('mouseout', onOut);
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', release);
    removeEventListener('scroll', onScroll);
    document.removeEventListener('transitionrun', onTransition);
    ownAnimations.forEach((anim) => anim.cancel());
    applied.forEach((_, el) => { el.style.translate = ''; });
    applied.clear();
    springs.clear();
    active = null; lensTarget = null; pressed = null;
    lens.r = 0; lens.tween = null;
    mouse.seen = false;
    els.cursor.remove();
    els.lens.remove();
    els.ring.remove();
    els = null;
    root.classList.remove('has-exe-cursor');
  };

  // Returns whether the custom cursor is live after re-checking the activation conditions
  const sync = () => {
    const ok = mqPointer.matches && !mqReduce.matches && innerWidth > DISABLE_BELOW;
    if (ok && !enabled) enable();
    else if (!ok && enabled) disable();
    return ok;
  };

  mqPointer.addEventListener('change', sync);
  mqReduce.addEventListener('change', sync);
  addEventListener('resize', onResize, { passive: true });
  sync();
})();
