import { CartesiaAgentClient } from './agents-web/client';
import { CartesiaAgentError } from './agents-web/errors';
import { clearHighlight, highlightSection } from './highlight';
import { ICONS } from './icons';
import { STYLES } from './styles';
import { type ThemeSetting, watchTheme } from './theme';
import { DocsTools, type Source, isSamePage, sourceHref } from './tools';

type Phase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

interface Message {
  turn: number;
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
}

interface WidgetConfig {
  ready: boolean;
  agentId: string | null;
  title: string;
  maxSessionSecs: number;
}

const STATUS: Record<Phase, string> = {
  idle: 'Ask an AI voice assistant about these docs. Audio is processed and recorded by Cartesia.',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

export function errorFor(err: unknown): { title: string; detail: string } {
  const code = err instanceof CartesiaAgentError ? err.code : '';
  const status = (err as { status?: number } | null)?.status;
  if (code === 'mic_denied') return { title: 'Microphone blocked', detail: 'Allow the microphone for this site in the browser settings, then try again.' };
  if (code === 'mic_unavailable') return { title: 'No microphone found', detail: 'Connect a microphone and try again.' };
  if (status === 403) return { title: 'Not allowed here', detail: 'This site is not on the allowed origins list for this widget.' };
  if (status === 429) return { title: 'Too many sessions', detail: 'Wait a minute and try again.' };
  if (status === 503) return { title: 'Not set up yet', detail: 'The voice agent or the docs index is missing on the server.' };
  return { title: 'Could not connect', detail: 'The voice agent did not answer. Try again in a moment.' };
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

export class DocsAgentElement extends HTMLElement {
  private root: ShadowRoot;
  private server = '';
  private config: WidgetConfig | null = null;
  private client: CartesiaAgentClient | null = null;
  private tools: DocsTools;
  private open = false;
  private phase: Phase = 'idle';
  private userSpeaking = false;
  private searching = false;
  private messages: Message[] = [];
  private cited: Array<{ id: string; source: Source }> = [];
  private activeCite = '';
  private error: { title: string; detail: string } | null = null;
  private ended = '';
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTheme: () => void = () => {};
  private theme: 'light' | 'dark' = 'light';
  private lastHttpError: HttpError | null = null;
  private uncited: string | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private footKey = '';
  private triggerKey = '';
  private gen = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.tools = new DocsTools({
      search: async (q) => {
        const gen = this.gen;
        const res = await this.search(q);
        if (gen === this.gen) this.uncited = Object.keys(res.sources)[0] ?? null;
        return res;
      },
      cite: (id, s) => {
        this.uncited = null;
        this.cite(id, s, true);
      },
      onSearching: (on) => {
        this.searching = on;
        this.render();
      },
    });
  }

  connectedCallback(): void {
    this.server = (this.getAttribute('server') || location.origin).replace(/\/+$/, '');
    this.root.innerHTML = `<style>${STYLES}</style><div class="root"></div>`;
    this.footKey = '';
    this.triggerKey = '';
    this.mount();
    this.stopTheme = watchTheme((this.getAttribute('theme') as ThemeSetting) || 'auto', (t) => {
      this.theme = t;
      this.setAttribute('data-theme', t);
    });
    this.render();
    addEventListener('keydown', this.onKey);
  }

  disconnectedCallback(): void {
    this.stopTheme();
    removeEventListener('keydown', this.onKey);
    void this.end();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.open) this.toggle(false);
  };

  private async loadConfig(): Promise<WidgetConfig> {
    if (this.config) return this.config;
    const res = await fetch(`${this.server}/api/config`);
    if (!res.ok) throw new HttpError(res.status);
    this.config = (await res.json()) as WidgetConfig;
    this.render();
    return this.config;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.server}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new HttpError(res.status);
    return (await res.json()) as T;
  }

  private search(query: string) {
    return this.post<{ result: string; sources: Record<string, Source> }>('/api/search', { query, page: location.pathname });
  }

  private toggle(next = !this.open): void {
    this.open = next;
    if (next) void this.loadConfig().catch(() => {});
    else void this.end();
    this.render();
    if (!next) this.$<HTMLButtonElement>('.trigger')?.focus();
  }

  private async start(): Promise<void> {
    if (this.client) return;
    const gen = ++this.gen;
    const stale = () => gen !== this.gen || !this.isConnected;
    this.error = null;
    this.ended = '';
    this.messages = [];
    this.cited = [];
    this.activeCite = '';
    this.uncited = null;
    this.tools.known.clear();
    this.phase = 'connecting';
    this.render();
    let config: WidgetConfig;
    try {
      config = await this.loadConfig();
      if (stale()) return;
      if (!config.ready || !config.agentId) throw new HttpError(503);
    } catch (err) {
      if (stale()) return;
      this.fail(err);
      return;
    }
    const client = new CartesiaAgentClient({
      agentId: config.agentId,
      getToken: async () => {
        try {
          return (await this.post<{ token: string }>('/api/token')).token;
        } catch (err) {
          this.lastHttpError = err instanceof HttpError ? err : null;
          throw err;
        }
      },
    });
    this.client = client;
    client.on('transcript', (e) => {
      if (this.client !== client) return;
      this.onTranscript(e);
    });
    client.on('turn_ended', (e) => {
      if (this.client !== client) return;
      if (e.role === 'user' && this.phase === 'listening') this.setPhase('thinking');
    });
    client.on('speaking', ({ who }) => {
      if (this.client !== client) return;
      this.userSpeaking = who === 'user';
      if (who === 'agent') this.setPhase('speaking');
      else if (this.phase === 'speaking') this.setPhase('listening');
      else this.render();
    });
    client.on('client_tool_call', async (call) => {
      if (this.client !== client) return;
      const out = await this.tools.run(call.toolName, call.parameters);
      if (out && this.client === client) call.respond(out.result, out.isError ? { isError: true, errorType: 'tool_failed' } : undefined);
    });
    client.on('close', () => {
      if (this.client !== client) return;
      this.client = null;
      this.clearCap();
      if (!this.error) this.ended = 'The session ended.';
      this.setPhase('idle');
    });
    try {
      await client.start();
      if (stale()) {
        if (this.client === client) this.client = null;
        await client.stop().catch(() => {});
        return;
      }
      this.setPhase('listening');
      const secs = config.maxSessionSecs || 300;
      this.capTimer = setTimeout(() => {
        void this.end(`Sessions end after ${sessionLength(secs)}. Start again to keep going.`);
      }, secs * 1000);
    } catch (err) {
      if (this.client === client) this.client = null;
      if (stale()) {
        this.lastHttpError = null;
        return;
      }
      this.fail(this.lastHttpError ?? err);
      this.lastHttpError = null;
    }
  }

  private fail(err: unknown): void {
    this.error = errorFor(err);
    this.phase = 'idle';
    this.render();
  }

  private clearCap(): void {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
    this.uncited = null;
    if (this.capTimer) clearTimeout(this.capTimer);
    this.capTimer = null;
  }

  private async end(note = ''): Promise<void> {
    this.gen++;
    this.clearCap();
    const client = this.client;
    this.client = null;
    if (note) this.ended = note;
    this.phase = 'idle';
    this.render();
    if (client) await client.stop().catch(() => {});
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.render();
  }

  private onTranscript(e: { turn: number; role: 'user' | 'assistant'; text: string; final: boolean }): void {
    if (e.role === 'assistant' && this.uncited && e.text.length > 40 && !this.fallbackTimer) {
      this.fallbackTimer = setTimeout(() => {
        this.fallbackTimer = null;
        const id = this.uncited;
        this.uncited = null;
        const source = id ? this.tools.known.get(id) : undefined;
        if (id && source && this.client) this.cite(id, source, true);
      }, 1200);
    }
    const m = this.messages.find((x) => x.turn === e.turn && x.role === e.role);
    if (m) {
      m.text = e.text;
      m.final = e.final;
    } else if (e.text.trim()) {
      this.messages.push({ turn: e.turn, role: e.role, text: e.text, final: e.final });
    }
    this.renderLog();
  }

  private cite(id: string, source: Source, fromAgent: boolean): void {
    if (!this.cited.some((c) => c.id === id)) this.cited.push({ id, source });
    this.activeCite = id;
    if (isSamePage(source.url)) {
      const dark = this.theme === 'dark';
      highlightSection(source.anchor, {
        tint: dark ? 'rgb(93 179 104 / 0.14)' : 'rgb(48 157 75 / 0.10)',
        edge: dark ? '#5db368' : '#309d4b',
        blend: dark ? 'normal' : 'multiply',
      });
    } else if (!fromAgent) {
      const href = sourceHref(source);
      if (href) location.href = href;
    }
    this.render();
  }

  private $<T extends Element>(sel: string): T | null {
    return this.root.querySelector<T>(sel);
  }

  private mount(): void {
    const host = this.$<HTMLDivElement>('.root')!;
    host.innerHTML = `
      <section class="panel" id="cda-panel" role="dialog" inert>
        <header class="head"><h2></h2>
          <button class="btn btn-ghost icon-sm" data-act="close" aria-label="Close">${ICONS.x}</button></header>
        <div class="body">
          <div class="stage">
            <div class="orb" aria-hidden="true"></div>
            <p class="status" role="status" aria-live="polite"></p>
          </div>
          <div class="notice"></div>
          <ol class="log" aria-label="Transcript"></ol>
          <div class="sources" hidden><span class="label">Sources</span><div class="chips"></div></div>
        </div>
        <footer class="foot"></footer>
      </section>
      <button class="btn btn-primary trigger" aria-controls="cda-panel"></button>`;
    host.addEventListener('click', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-act],[data-cite]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'toggle') this.toggle();
      else if (act === 'close') this.toggle(false);
      else if (act === 'start') void this.start();
      else if (act === 'end') void this.end();
      else if (act === 'mute' && this.client) {
        this.client.setMuted(!this.client.muted);
        this.render();
      } else if (el.dataset.cite) {
        const c = this.cited.find((x) => x.id === el.dataset.cite);
        if (!c) return;
        e.preventDefault();
        if (!isSamePage(c.source.url) && this.client) {
          const href = sourceHref(c.source);
          if (href) window.open(href, '_blank', 'noopener');
          return;
        }
        this.cite(c.id, c.source, false);
      }
    });
  }

  private render(): void {
    const panel = this.$<HTMLElement>('.panel');
    if (!panel) return;
    const live = this.client !== null && this.phase !== 'connecting';
    const busy = this.phase === 'connecting';
    const titleText = this.config?.title || this.getAttribute('title') || 'Ask the docs';
    const title = esc(titleText);
    const phase: Phase = this.phase === 'listening' && this.searching ? 'thinking' : this.phase;
    const status = this.error ? '' : this.phase === 'idle' && this.ended ? this.ended : this.searching ? 'Searching the docs' : STATUS[phase];

    panel.classList.toggle('open', this.open);
    panel.toggleAttribute('inert', !this.open);
    panel.setAttribute('aria-label', titleText);
    this.$('.head h2')!.textContent = titleText;
    const orb = this.$<HTMLElement>('.orb')!;
    orb.dataset.state = phase;
    orb.dataset.user = this.userSpeaking ? '1' : '0';
    this.$('.status')!.textContent = status;

    const notice = this.error
      ? `<div class="alert" role="alert">${ICONS.alert}<span class="t">${esc(this.error.title)}</span><span class="d">${esc(this.error.detail)}</span></div>`
      : !live && !busy && this.messages.length === 0
        ? `<div class="hint"><p class="t">Talk to the docs</p><p class="d">Ask a question out loud. Answers come from this site, and the cited section scrolls into view. Your browser will ask to use the microphone.</p></div>`
        : '';
    const noticeEl = this.$<HTMLElement>('.notice')!;
    if (noticeEl.innerHTML !== notice) noticeEl.innerHTML = notice;
    noticeEl.hidden = !notice;

    const sources = this.$<HTMLElement>('.sources')!;
    sources.hidden = this.cited.length === 0;
    this.$('.chips')!.innerHTML = this.cited
      .map(
        ({ id, source }) =>
          `<a class="chip${id === this.activeCite ? ' on' : ''}" href="${esc(sourceHref(source) ?? '#')}" data-cite="${esc(id)}" title="${esc(source.title)}">${ICONS.file}<span>${esc(source.heading || source.title)}</span></a>`,
      )
      .join('');

    const muted = this.client?.muted ?? false;
    const foot = live || busy
      ? `<button class="btn btn-outline icon" data-act="mute" aria-pressed="${muted}" aria-label="${muted ? 'Unmute' : 'Mute'}" ${busy ? 'disabled' : ''}>${muted ? ICONS.micOff : ICONS.mic}</button><button class="btn btn-end grow" data-act="end">End</button>`
      : `<button class="btn btn-primary grow" data-act="start">${ICONS.mic}Start talking</button>`;
    const footEl = this.$<HTMLElement>('.foot')!;
    if (this.footKey !== foot) {
      footEl.innerHTML = foot;
      this.footKey = foot;
    }

    const trigger = this.$<HTMLButtonElement>('.trigger')!;
    trigger.dataset.act = 'toggle';
    trigger.classList.toggle('open', this.open);
    trigger.setAttribute('aria-expanded', String(this.open));
    trigger.setAttribute('aria-label', this.open ? 'Close the docs assistant' : titleText);
    const tri = this.open ? ICONS.chevronDown : `${ICONS.audio}<span>${title}</span>`;
    if (this.triggerKey !== tri) {
      trigger.innerHTML = tri;
      this.triggerKey = tri;
    }
  }

  private renderLog(): void {
    const log = this.$<HTMLOListElement>('.log');
    if (!log) return;
    log.innerHTML = this.messages
      .map((m) => `<li class="msg ${m.role}${m.final || m.role === 'assistant' ? '' : ' live'}">${esc(m.text)}</li>`)
      .join('');
    const body = this.$<HTMLDivElement>('.body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  clearHighlight(): void {
    clearHighlight();
  }
}

export function sessionLength(secs: number): string {
  if (secs < 60) return `${secs} ${secs === 1 ? 'second' : 'seconds'}`;
  const mins = Math.round(secs / 60);
  return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
