// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ instances: [] as Array<{ started: boolean; stopped: boolean; release: () => void }> }));

vi.mock('../widget/src/agents-web/client', () => ({
  CartesiaAgentClient: class {
    muted = false;
    started = false;
    stopped = false;
    private reject: ((e: Error) => void) | null = null;
    release: () => void = () => {};
    constructor() {
      fake.instances.push(this);
    }
    on() {}
    setMuted() {}
    start() {
      this.started = true;
      return new Promise<void>((resolve, reject) => {
        this.release = resolve;
        this.reject = reject;
      });
    }
    stop() {
      this.stopped = true;
      this.reject?.(new Error('Stopped before ready.'));
      return Promise.resolve();
    }
  },
}));

const { DocsAgentElement, sessionLength } = await import('../widget/src/element');

const config = { ready: true, agentId: 'agent_x', title: 'Ask the docs', maxSessionSecs: 300 };
let releaseConfig: () => void = () => {};

function make() {
  const el = document.createElement('cartesia-docs-agent') as InstanceType<typeof DocsAgentElement>;
  el.setAttribute('server', 'https://docs.example.com');
  document.body.appendChild(el);
  return el;
}
const q = (el: HTMLElement, sel: string) => el.shadowRoot!.querySelector<HTMLElement>(sel)!;
const click = (el: HTMLElement, act: string) => q(el, `[data-act="${act}"]`).click();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
  customElements.define('cartesia-docs-agent', DocsAgentElement);
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
});

beforeEach(() => {
  fake.instances.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releaseConfig = () => resolve(new Response(JSON.stringify(config)));
        }),
    ),
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('DocsAgentElement', () => {
  it('fills the launcher again after the element moves in the DOM', () => {
    const el = make();
    expect(q(el, '.trigger').textContent).toContain('Ask the docs');
    const box = document.createElement('div');
    document.body.appendChild(box);
    box.appendChild(el);
    expect(q(el, '.trigger').textContent).toContain('Ask the docs');
    expect(q(el, '.foot').querySelector('[data-act="start"]')).not.toBeNull();
  });

  it('does not open the mic when the session ends while the config loads', async () => {
    const el = make();
    click(el, 'start');
    click(el, 'end');
    releaseConfig();
    await flush();
    expect(fake.instances).toHaveLength(0);
    expect(q(el, '.notice').textContent).not.toContain('Could not connect');
  });

  it('does not open the mic when the element is removed while the config loads', async () => {
    const el = make();
    click(el, 'start');
    el.remove();
    releaseConfig();
    await flush();
    expect(fake.instances).toHaveLength(0);
  });

  it('shows no error when the user ends the session while it connects', async () => {
    const el = make();
    click(el, 'start');
    releaseConfig();
    await flush();
    expect(fake.instances[0]!.started).toBe(true);
    click(el, 'end');
    await flush();
    expect(fake.instances[0]!.stopped).toBe(true);
    expect(q(el, '.notice').textContent).not.toContain('Could not connect');
    expect(q(el, '.foot').querySelector('[data-act="start"]')).not.toBeNull();
  });

  it('says seconds for short session caps', () => {
    expect(sessionLength(20)).toBe('20 seconds');
    expect(sessionLength(60)).toBe('1 minute');
    expect(sessionLength(300)).toBe('5 minutes');
  });
});
