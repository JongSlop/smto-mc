import { gzipSync } from 'fflate';
import { encodeMutf8 } from './mutf8.js';
import { TAG_IDS, type NbtFile, type Tag, type TagType } from './types.js';

class Writer {
  private buf = new Uint8Array(1 << 16);
  private view = new DataView(this.buf.buffer);
  private pos = 0;

  private ensure(n: number) {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number) {
    this.ensure(1);
    this.view.setUint8(this.pos++, v);
  }
  i8(v: number) {
    this.ensure(1);
    this.view.setInt8(this.pos++, v);
  }
  i16(v: number) {
    this.ensure(2);
    this.view.setInt16(this.pos, v);
    this.pos += 2;
  }
  u16(v: number) {
    this.ensure(2);
    this.view.setUint16(this.pos, v);
    this.pos += 2;
  }
  i32(v: number) {
    this.ensure(4);
    this.view.setInt32(this.pos, v);
    this.pos += 4;
  }
  i64(v: bigint) {
    this.ensure(8);
    this.view.setBigInt64(this.pos, v);
    this.pos += 8;
  }
  f32(v: number) {
    this.ensure(4);
    this.view.setFloat32(this.pos, v);
    this.pos += 4;
  }
  f64(v: number) {
    this.ensure(8);
    this.view.setFloat64(this.pos, v);
    this.pos += 8;
  }
  string(s: string) {
    const b = encodeMutf8(s);
    if (b.length > 0xffff) throw new Error('NBT string too long');
    this.u16(b.length);
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  payload(tag: Tag) {
    switch (tag.t) {
      case 'byte':
        return this.i8(tag.v);
      case 'short':
        return this.i16(tag.v);
      case 'int':
        return this.i32(tag.v);
      case 'long':
        return this.i64(tag.v);
      case 'float':
        return this.f32(tag.v);
      case 'double':
        return this.f64(tag.v);
      case 'string':
        return this.string(tag.v);
      case 'bytes':
        this.i32(tag.v.length);
        for (const b of tag.v) this.i8(b);
        return;
      case 'ints':
        this.i32(tag.v.length);
        for (const x of tag.v) this.i32(x);
        return;
      case 'longs':
        this.i32(tag.v.length);
        for (const x of tag.v) this.i64(x);
        return;
      case 'list': {
        const of: TagType = tag.of;
        this.u8(TAG_IDS.indexOf(of));
        this.i32(tag.v.length);
        for (const x of tag.v) {
          if (x.t !== of) throw new Error(`Heterogeneous list: expected ${of}, found ${x.t}`);
          this.payload(x);
        }
        return;
      }
      case 'compound':
        for (const [k, v] of tag.v) {
          this.u8(TAG_IDS.indexOf(v.t));
          this.string(k);
          this.payload(v);
        }
        this.u8(0);
        return;
    }
  }

  file(f: NbtFile): Uint8Array {
    this.u8(10);
    this.string(f.name);
    this.payload(f.root);
    return this.buf.slice(0, this.pos);
  }
}

export function writeNbtRaw(file: NbtFile): Uint8Array {
  return new Writer().file(file);
}

/** Serialises to gzip-compressed NBT, which is what structure and schematic files use. */
export function writeNbt(file: NbtFile): Uint8Array {
  return gzipSync(writeNbtRaw(file), { level: 9 });
}
