import { DocsAgentElement } from './element';

const TAG = 'cartesia-docs-agent';
const script = document.currentScript as HTMLScriptElement | null;
const server = script?.src ? new URL(script.src).origin : location.origin;

function addFont(): void {
  if (document.querySelector('style[data-cartesia-docs-font]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-cartesia-docs-font', '');
  style.textContent = `@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(${server}/widget/inter.woff2) format("woff2-variations");}`;
  document.head.appendChild(style);
}

function mount(): void {
  addFont();
  if (!customElements.get(TAG)) customElements.define(TAG, DocsAgentElement);
  if (document.querySelector(TAG)) return;
  const el = document.createElement(TAG);
  el.setAttribute('server', server);
  if (script?.dataset.theme) el.setAttribute('theme', script.dataset.theme);
  if (script?.dataset.title) el.setAttribute('title', script.dataset.title);
  document.body.appendChild(el);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
