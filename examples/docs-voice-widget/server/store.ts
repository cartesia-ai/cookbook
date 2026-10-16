import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodeVector, dot, encodeVector } from './embeddings';

export interface Chunk {
  id: string;
  url: string;
  title: string;
  heading: string;
  anchor: string;
  text: string;
  vector: Float32Array;
}

export interface PageRecord {
  checksum: string;
  title: string;
}

export interface IndexFile {
  version: 1;
  model: string;
  dimensions: number;
  updatedAt: string;
  pages: Record<string, PageRecord>;
  chunks: Array<Omit<Chunk, 'vector'> & { vector: string }>;
}

export class DocIndex {
  constructor(
    public model: string,
    public dimensions: number,
    public pages: Map<string, PageRecord> = new Map(),
    public chunks: Chunk[] = [],
  ) {}

  static load(path: string): DocIndex | null {
    if (!existsSync(path)) return null;
    const json = JSON.parse(readFileSync(path, 'utf8')) as IndexFile;
    if (json.version !== 1) throw new Error(`${path} has an unknown index version.`);
    return new DocIndex(
      json.model,
      json.dimensions,
      new Map(Object.entries(json.pages)),
      json.chunks.map((c) => ({ ...c, vector: decodeVector(c.vector) })),
    );
  }

  save(path: string): void {
    const json: IndexFile = {
      version: 1,
      model: this.model,
      dimensions: this.dimensions,
      updatedAt: new Date().toISOString(),
      pages: Object.fromEntries(this.pages),
      chunks: this.chunks.map((c) => ({ ...c, vector: encodeVector(c.vector) })),
    };
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(json));
    renameSync(tmp, path);
  }

  setPage(url: string, record: PageRecord, chunks: Chunk[]): void {
    this.chunks = this.chunks.filter((c) => c.url !== url).concat(chunks);
    this.pages.set(url, record);
  }

  removePage(url: string): void {
    this.chunks = this.chunks.filter((c) => c.url !== url);
    this.pages.delete(url);
  }

  search(query: Float32Array, k: number, boost?: (c: Chunk) => number): Array<{ chunk: Chunk; score: number }> {
    const scored = this.chunks.map((chunk) => ({ chunk, score: dot(query, chunk.vector) + (boost?.(chunk) ?? 0) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
