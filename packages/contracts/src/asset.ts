import { z } from 'zod';

/**
 * What an admin may upload for a server.
 *
 * Raster images only, and that is a security decision rather than an
 * oversight. These files are served from this service's own origin, and an SVG
 * is a document that can carry script: one uploaded here would run with the
 * page's privileges for anybody who opened it. Only admins can upload, so the
 * exposure is small, but the mitigation is smaller still. Icons and
 * backgrounds are PNG and JPEG in practice, which is what the launcher's pack
 * JSON already points at.
 */
export const ASSET_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const assetContentTypeSchema = z.enum(ASSET_CONTENT_TYPES);
export type AssetContentType = z.infer<typeof assetContentTypeSchema>;

/**
 * 8 MiB. Comfortably above a 1920x1080 background and far below anything that
 * would make a row awkward to move around. Both ends enforce it: the browser
 * so somebody is told before a long upload, the backend because it is the
 * side that has to mean it.
 */
export const ASSET_MAX_BYTES = 8 * 1024 * 1024;

/** The extension each accepted type is stored and served under. */
export const ASSET_EXTENSIONS: Record<AssetContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * A file name, not a path.
 *
 * It ends up in a public URL, so anything that could change what that URL
 * means is out: no slashes, no leading dot, nothing but the characters a URL
 * carries without escaping.
 */
export const assetFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'file name must be letters, digits, dot, dash, underscore')
  .refine((value) => !value.includes('..'), 'file name must not contain ..');

export const serverAssetSchema = z.object({
  id: z.uuid(),
  serverId: z.string(),
  filename: z.string(),
  contentType: assetContentTypeSchema,
  byteSize: z.number().int().nonnegative(),
  /** SHA-256 of the bytes, hex. Doubles as the ETag on the public route. */
  checksum: z.string(),
  /**
   * The absolute address the file is served at, ready to paste into the
   * launcher's pack JSON. Built from PUBLIC_ORIGIN by the backend, because the
   * backend is the only side that knows what this deployment is reachable as.
   */
  url: z.url(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ServerAsset = z.infer<typeof serverAssetSchema>;
