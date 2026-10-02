/** Java "modified UTF-8" as used by NBT strings. */
export function encodeMutf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i); // UTF-16 code unit; surrogates are encoded individually (3 bytes each)
    if (c !== 0 && c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(out);
}

export function decodeMutf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i++]!;
    if (c < 0x80) s += String.fromCharCode(c);
    else if ((c & 0xe0) === 0xc0) s += String.fromCharCode(((c & 0x1f) << 6) | (b[i++]! & 0x3f));
    else {
      const c2 = b[i++]!;
      const c3 = b[i++]!;
      s += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
    }
  }
  return s;
}
