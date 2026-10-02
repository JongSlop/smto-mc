import { isCompound, isList, isNumeric, type Tag } from '../nbt/index.js';

const BOOLEAN_STYLE_KEYS = new Set(['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated']);
/** Keys whose payload format changed in 1.21.5 and that 1.20.1 would not understand. */
const DROPPED_KEYS = new Set(['click_event', 'hover_event', 'shadow_color']);

/** Converts a 1.21 NBT text component into a plain JSON value understood by 1.20.1. */
export function textToJsonValue(tag: Tag): unknown {
  if (tag.t === 'string') return { text: tag.v };
  if (isList(tag)) return tag.v.map((x) => (x.t === 'string' ? { text: x.v } : textToJsonValue(x)));
  if (isCompound(tag)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of tag.v) {
      if (DROPPED_KEYS.has(k)) continue;
      if (isNumeric(v) && BOOLEAN_STYLE_KEYS.has(k)) out[k] = v.v !== 0;
      else if (k === 'extra' && isList(v))
        out[k] = v.v.map((x) => (x.t === 'string' ? { text: x.v } : textToJsonValue(x)));
      else if (v.t === 'string') out[k] = v.v;
      else if (isNumeric(v)) out[k] = v.v;
      else if (v.t === 'long') out[k] = Number(v.v);
      else out[k] = textToJsonValue(v);
    }
    return out;
  }
  if (isNumeric(tag)) return { text: String(tag.v) };
  return { text: '' };
}

export const textToJson = (tag: Tag): string => JSON.stringify(textToJsonValue(tag));
