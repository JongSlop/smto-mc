import type { Tag } from './types.js';

/** Compact, human readable dump (SNBT-like). Used by tests and the CLI `--dump` flag. */
export function toSnbt(tag: Tag, indent = 0, max = 200): string {
  const pad = '  '.repeat(indent);
  switch (tag.t) {
    case 'byte':
      return `${tag.v}b`;
    case 'short':
      return `${tag.v}s`;
    case 'int':
      return String(tag.v);
    case 'long':
      return `${tag.v}L`;
    case 'float':
      return `${tag.v}f`;
    case 'double':
      return `${tag.v}d`;
    case 'string':
      return JSON.stringify(tag.v);
    case 'bytes':
      return `[B;${[...tag.v].join(',')}]`;
    case 'ints':
      return `[I;${[...tag.v].join(',')}]`;
    case 'longs':
      return `[L;${[...tag.v].join('L,')}L]`;
    case 'list': {
      if (tag.v.length === 0) return '[]';
      const simple = tag.v.every((x) => x.t !== 'compound' && x.t !== 'list');
      if (simple)
        return `[${tag.v
          .slice(0, max)
          .map((x) => toSnbt(x, 0))
          .join(', ')}]`;
      return `[\n${tag.v
        .slice(0, max)
        .map((x) => `${pad}  ${toSnbt(x, indent + 1, max)}`)
        .join(',\n')}\n${pad}]`;
    }
    case 'compound': {
      if (tag.v.size === 0) return '{}';
      const lines = [...tag.v].map(([k, v]) => `${pad}  ${k}: ${toSnbt(v, indent + 1, max)}`);
      return `{\n${lines.join('\n')}\n${pad}}`;
    }
  }
}
