const HEADING = /^H([1-6])$/;
let current: { box: HTMLElement; timer: ReturnType<typeof setTimeout>; onResize: () => void } | null = null;

export function sectionElements(target: Element): Element[] {
  const m = target.tagName.match(HEADING);
  if (!m) return [target];
  const level = Number(m[1]);
  const out: Element[] = [target];
  let el = target.nextElementSibling;
  while (el) {
    const h = el.tagName.match(HEADING);
    if (h && Number(h[1]) <= level) break;
    out.push(el);
    el = el.nextElementSibling;
  }
  return out;
}

export function findSection(anchor: string, doc: Document = document): Element | null {
  if (anchor) {
    const byId = doc.getElementById(anchor);
    if (byId) {
      const heading = byId.closest('h1,h2,h3,h4,h5,h6');
      return heading ?? byId;
    }
    return null;
  }
  return doc.querySelector('main h1, article h1, h1') ?? doc.querySelector('main, article');
}

function unionRect(els: Element[]): { top: number; left: number; width: number; height: number } {
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!isFinite(top)) return { top: 0, left: 0, width: 0, height: 0 };
  return { top: top + scrollY, left: left + scrollX, width: right - left, height: bottom - top };
}

export function clearHighlight(): void {
  if (!current) return;
  clearTimeout(current.timer);
  removeEventListener('resize', current.onResize);
  current.box.remove();
  current = null;
}

export function highlightSection(anchor: string, colors: { tint: string; edge: string; blend: string }, ms = 8000): boolean {
  const target = findSection(anchor);
  if (!target) return false;
  clearHighlight();
  const els = sectionElements(target);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  const box = document.createElement('div');
  box.setAttribute('data-cartesia-docs-highlight', '');
  box.setAttribute('aria-hidden', 'true');
  const place = () => {
    const r = unionRect(els);
    Object.assign(box.style, {
      position: 'absolute',
      top: `${r.top - 8}px`,
      left: `${r.left - 12}px`,
      width: `${r.width + 24}px`,
      height: `${r.height + 16}px`,
      background: colors.tint,
      boxShadow: `inset 3px 0 0 ${colors.edge}`,
      borderRadius: '8px',
      pointerEvents: 'none',
      zIndex: '2147482000',
      mixBlendMode: colors.blend,
      transition: reduce ? 'none' : 'opacity .6s ease',
      opacity: '1',
    });
  };
  place();
  document.body.appendChild(box);
  const onResize = () => place();
  addEventListener('resize', onResize);
  const timer = setTimeout(() => {
    box.style.opacity = '0';
    setTimeout(clearHighlight, 700);
  }, ms);
  current = { box, timer, onResize };
  return true;
}
