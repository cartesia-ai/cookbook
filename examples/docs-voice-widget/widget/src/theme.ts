export type ThemeSetting = 'auto' | 'light' | 'dark';

export function hostPrefersDark(doc: Document = document, media?: (q: string) => boolean): boolean {
  const html = doc.documentElement;
  const attr = (html.getAttribute('data-theme') || html.getAttribute('data-mode') || '').toLowerCase();
  if (html.classList.contains('dark') || attr === 'dark') return true;
  if (html.classList.contains('light') || attr === 'light') return false;
  const mm = media ?? ((q: string) => typeof matchMedia === 'function' && matchMedia(q).matches);
  return mm('(prefers-color-scheme: dark)');
}

export function resolveTheme(setting: ThemeSetting, doc: Document = document, media?: (q: string) => boolean): 'light' | 'dark' {
  if (setting === 'light' || setting === 'dark') return setting;
  return hostPrefersDark(doc, media) ? 'dark' : 'light';
}

export function watchTheme(setting: ThemeSetting, apply: (t: 'light' | 'dark') => void): () => void {
  const run = () => apply(resolveTheme(setting));
  run();
  if (setting !== 'auto') return () => {};
  const mo = new MutationObserver(run);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', run);
  return () => {
    mo.disconnect();
    mq.removeEventListener('change', run);
  };
}
