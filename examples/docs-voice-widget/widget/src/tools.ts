export interface Source {
  title: string;
  heading: string;
  url: string;
  anchor: string;
}

export interface ToolHost {
  search(query: string): Promise<{ result: string; sources: Record<string, Source> }>;
  cite(id: string, source: Source): void;
  onSearching(active: boolean): void;
}

export class DocsTools {
  readonly known = new Map<string, Source>();

  constructor(private readonly host: ToolHost) {}

  async run(name: string, params: Record<string, unknown>): Promise<{ result: string; isError?: boolean } | null> {
    if (name === 'search_docs') {
      const query = typeof params.query === 'string' ? params.query : '';
      if (!query.trim()) return { result: 'Pass a query.', isError: true };
      this.host.onSearching(true);
      try {
        const { result, sources } = await this.host.search(query);
        for (const [id, s] of Object.entries(sources)) this.known.set(id, s);
        return { result };
      } catch {
        return { result: 'Search is unavailable right now. Say you could not look it up.', isError: true };
      } finally {
        this.host.onSearching(false);
      }
    }
    if (name === 'show_source') {
      const id = typeof params.source_id === 'string' ? params.source_id : '';
      const source = this.known.get(id);
      if (source) this.host.cite(id, source);
      return null;
    }
    return { result: `Unknown tool ${name}.`, isError: true };
  }
}

export function isSamePage(url: string, loc: { href: string; pathname: string } = location): boolean {
  try {
    const u = new URL(url, loc.href);
    const strip = (p: string) => p.replace(/\/+$/, '') || '/';
    return u.origin === new URL(loc.href).origin && strip(u.pathname) === strip(loc.pathname);
  } catch {
    return false;
  }
}

export function sourceHref(s: Source, base: string = location.href): string | null {
  try {
    const u = new URL(s.url, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (s.anchor) u.hash = s.anchor;
    return u.toString();
  } catch {
    return null;
  }
}
