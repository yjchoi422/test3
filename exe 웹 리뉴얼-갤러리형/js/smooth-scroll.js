(() => {
  // Eased page scrolling: wheel, in-page anchors and scroll keys glide with ease-in-out.
  // Touch, scrollbar drags and reduced-motion users keep native scrolling.
  const WHEEL_DURATION = 650;                 // ms for each wheel retarget
  const KEY_DURATION = 600;
  const ANCHOR_MIN = 600, ANCHOR_MAX = 1200;  // anchor jumps scale with distance
  const LINE_PX = 40, ARROW_PX = 120, HEADER_PX = 80;
  const TAKEOVER_PX = 2;                       // drift beyond this means something else scrolled

  const root = document.documentElement;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

  let tween = null;  // { from, to, v0, start, dur }
  let raf = 0;
  let lastY = null;

  const maxScroll = () => root.scrollHeight - innerHeight;
  const clampY = (y) => Math.max(0, Math.min(maxScroll(), y));

  // Cubic Hermite from (from, v0) to (to, 0). With v0 = 0 it is the classic ease-in-out curve;
  // retargeting mid-flight carries the current velocity, so consecutive wheel ticks never stall.
  const sample = (tw, now) => {
    const t = Math.min(1, (now - tw.start) / tw.dur);
    const t2 = t * t, t3 = t2 * t;
    const m = tw.v0 * tw.dur;
    const pos = (2 * t3 - 3 * t2 + 1) * tw.from + (t3 - 2 * t2 + t) * m + (-2 * t3 + 3 * t2) * tw.to;
    const vel = ((6 * t2 - 6 * t) * tw.from + (3 * t2 - 4 * t + 1) * m + (-6 * t2 + 6 * t) * tw.to) / tw.dur;
    return { t, pos, vel };
  };

  const frame = (now) => {
    raf = 0;
    if (!tween) return;
    if (lastY !== null && Math.abs(scrollY - lastY) > TAKEOVER_PX) { tween = null; lastY = null; return; }
    const { t, pos } = sample(tween, now);
    window.scrollTo({ top: pos, behavior: 'instant' });
    lastY = scrollY;
    if (t >= 1) { tween = null; lastY = null; } else raf = requestAnimationFrame(frame);
  };

  const glideTo = (y, dur) => {
    const now = performance.now();
    const to = clampY(y);
    let from = scrollY, v0 = 0;
    if (tween) ({ pos: from, vel: v0 } = sample(tween, now));
    const dist = to - from;
    if (Math.abs(dist) < 0.5) return;
    // Keep momentum only in the same direction, capped so the curve never overshoots the target
    v0 = Math.sign(v0) === Math.sign(dist) ? Math.sign(dist) * Math.min(Math.abs(v0), (3 * Math.abs(dist)) / dur) : 0;
    tween = { from, to, v0, start: now, dur };
    lastY = scrollY;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const destination = () => (tween ? tween.to : scrollY);

  // Let nested scroll areas (e.g. a tall sticky filter list) scroll themselves first
  const scrollsInside = (node, dy) => {
    for (let el = node instanceof Element ? node : null; el && el !== document.body && el !== root; el = el.parentElement) {
      const { overflowY } = getComputedStyle(el);
      if (!/(auto|scroll|overlay)/.test(overflowY) || el.scrollHeight <= el.clientHeight) continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    return false;
  };

  const onWheel = (event) => {
    if (mqReduce.matches || event.defaultPrevented || event.ctrlKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (scrollsInside(event.target, event.deltaY)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? innerHeight : 1;
    glideTo(destination() + event.deltaY * unit, WHEEL_DURATION);
  };

  const onKey = (event) => {
    if (mqReduce.matches || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest(`${EDITABLE}, button, [role="button"]`) && event.key === ' ') return;
    if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
    const page = innerHeight - HEADER_PX - 40;
    const step = {
      ArrowDown: ARROW_PX, ArrowUp: -ARROW_PX, PageDown: page, PageUp: -page,
      ' ': event.shiftKey ? -page : page,
    }[event.key];
    let y;
    if (event.key === 'Home') y = 0;
    else if (event.key === 'End') y = maxScroll();
    else if (step !== undefined) y = destination() + step;
    else return;
    event.preventDefault();
    glideTo(y, KEY_DURATION);
  };

  // Same document? Shared components link as "./index.html#projects", so compare paths, not href text
  const pagePath = (url) => url.pathname.replace(/\/index\.html$/, '/');
  const onClick = (event) => {
    if (mqReduce.matches || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element && event.target.closest('a[href]');
    if (!link || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || pagePath(url) !== pagePath(location)) return;
    if (!url.hash && url.search !== location.search) return;
    const id = decodeURIComponent(url.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (id && !target) return;
    event.preventDefault();
    const margin = target ? parseFloat(getComputedStyle(target).scrollMarginTop) || 0 : 0;
    const y = target ? target.getBoundingClientRect().top + scrollY - margin : 0;
    const dur = Math.min(ANCHOR_MAX, Math.max(ANCHOR_MIN, 400 + Math.abs(y - scrollY) * 0.15));
    glideTo(y, dur);
    if (id && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  };

  // Arriving from another page with #hash (e.g. sub-nav → index.html?industry=…#projects):
  // land on the target ourselves, honouring scroll-margin-top, instead of relying on the
  // native smooth fragment scroll (which can stall or start from the top).
  const landOnHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const y = clampY(target.getBoundingClientRect().top + scrollY - margin);
    if (Math.abs(y - scrollY) > TAKEOVER_PX) window.scrollTo({ top: y, behavior: 'instant' });
  };
  if (document.readyState === 'complete') landOnHash();
  else addEventListener('load', landOnHash, { once: true });

  // Lets other scripts move the page by a layout delta without cancelling an in-flight glide
  // (app.js uses it to keep an expanding project card's top edge in place).
  window.exeScroll = {
    shift(dy) {
      window.scrollTo({ top: scrollY + dy, behavior: 'instant' });
      if (tween) { tween.from += dy; tween.to += dy; }
      if (lastY !== null) lastY = scrollY;
    },
  };

  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKey);
  document.addEventListener('click', onClick);
})();
