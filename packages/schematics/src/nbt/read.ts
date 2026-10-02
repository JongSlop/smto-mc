import { gunzipSync, unzlibSync } from 'fflate';
import { decodeMutf8 } from './mutf8.js';
import { TAG_IDS, type CompoundTag, type NbtFile, type Tag, type TagType } from './types.js';

class Reader {
  private pos = 0;
  private view: DataView;
  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private need(n: number) {
    if (this.pos + n > this.buf.length) throw new Error('Unexpected end of NBT data');
  }
  i8() {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }
  u8() {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  i16() {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  i64() {
    this.need(8);
    const v = this.view.getBigInt64(this.pos);
    this.pos += 8;
    return v;
  }
  f32() {
    this.need(4);
    const v = this.view.getFloat32(this.pos);
    this.pos += 4;
    return v;
  }
  f64() {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }
  string(): string {
    const n = this.u16();
    this.need(n);
    const s = decodeMutf8(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }

  payload(type: TagType, depth: number): Tag {
    if (depth > 512) throw new Error('NBT nesting too deep');
    switch (type) {
      case 'byte':
        return { t: 'byte', v: this.i8() };
      case 'short':
        return { t: 'short', v: this.i16() };
      case 'int':
        return { t: 'int', v: this.i32() };
      case 'long':
        return { t: 'long', v: this.i64() };
      case 'float':
        return { t: 'float', v: this.f32() };
      case 'double':
        return { t: 'double', v: this.f64() };
      case 'string':
        return { t: 'string', v: this.string() };
      case 'bytes': {
        const n = this.i32();
        this.need(n);
        const v = new Int8Array(n);
        for (let i = 0; i < n; i++) v[i] = this.view.getInt8(this.pos + i);
        this.pos += n;
        return { t: 'bytes', v };
      }
      case 'ints': {
        const n = this.i32();
        const v = new Int32Array(n);
        for (let i = 0; i < n; i++) v[i] = this.i32();
        return { t: 'ints', v };
      }
      case 'longs': {
        const n = this.i32();
        const v = new BigInt64Array(n);
        for (let i = 0; i < n; i++) v[i] = this.i64();
        return { t: 'longs', v };
      }
      case 'list': {
        const of = TAG_IDS[this.u8()];
        if (!of) throw new Error('Invalid list element type');
        const n = this.i32();
        const v: Tag[] = [];
        for (let i = 0; i < n; i++) v.push(this.payload(of, depth + 1));
        return { t: 'list', of, v };
      }
      case 'compound': {
        const m = new Map<string, Tag>();
        for (;;) {
          const id = this.u8();
          if (id === 0) break;
          const t = TAG_IDS[id];
          if (!t) throw new Error(`Invalid tag id ${id}`);
          const name = this.string();
          m.set(name, this.payload(t, depth + 1));
        }
        return { t: 'compound', v: m };
      }
      default:
        throw new Error(`Cannot read tag type ${type}`);
    }
  }

  file(): NbtFile {
    const id = this.u8();
    if (id !== 10) throw new Error('Not an NBT file: root tag is not a compound');
    const name = this.string();
    return { name, root: this.payload('compound', 0) as CompoundTag };
  }
}

/** Parses NBT bytes. Handles gzip, zlib and uncompressed data. */
export function readNbt(data: Uint8Array): NbtFile {
  let raw = data;
  if (data[0] === 0x1f && data[1] === 0x8b) raw = gunzipSync(data);
  else if (data[0] === 0x78) {
    try {
      raw = unzlibSync(data);
    } catch {
      raw = data;
    }
  }
  return new Reader(raw).file();
}
