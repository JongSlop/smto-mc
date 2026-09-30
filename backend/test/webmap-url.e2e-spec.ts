import { serverWebmapUrl } from '@smto/mc-contracts';
import { describe, expect, it } from 'vitest';

/**
 * Where a server's web map points. The value is free-form text an admin typed
 * and it ends up in an href, so what matters is what is refused.
 */
describe('serverWebmapUrl', () => {
  it('returns an http or https address', () => {
    expect(serverWebmapUrl({ webmap: 'https://map.smto.dev/i5/' })).toBe(
      'https://map.smto.dev/i5/',
    );
    expect(serverWebmapUrl({ webmap: 'http://10.0.0.5:8123' })).toBe('http://10.0.0.5:8123');
  });

  it('accepts a map reached by IP address and port, as Dynmap often is', () => {
    expect(serverWebmapUrl({ webmap: 'http://localhost:8123/' })).toBe('http://localhost:8123/');
    expect(serverWebmapUrl({ webmap: 'http://[::1]:8123/' })).toBe('http://[::1]:8123/');
  });

  it('trims what was typed', () => {
    expect(serverWebmapUrl({ webmap: '  https://map.smto.dev/  ' })).toBe('https://map.smto.dev/');
  });

  it('refuses schemes that would run or fetch something in the visitor’s browser', () => {
    for (const webmap of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com/map',
    ]) {
      expect(serverWebmapUrl({ webmap }), webmap).toBeNull();
    }
  });

  it('means no map for anything that is not an address', () => {
    for (const webmap of [
      '',
      '   ',
      'map.smto.dev',
      'not a url',
      '/relative/path',
      null,
      42,
      true,
      {},
      [],
    ]) {
      expect(serverWebmapUrl({ webmap }), String(webmap)).toBeNull();
    }
  });

  it('means no map when the field is absent, or extra is', () => {
    expect(serverWebmapUrl({})).toBeNull();
    expect(serverWebmapUrl({ ip: 'i5.smto.dev' })).toBeNull();
    expect(serverWebmapUrl(null)).toBeNull();
    expect(serverWebmapUrl(undefined)).toBeNull();
  });
});
