import { z } from 'zod';

import { mcUuidSchema } from './minecraft.js';

/**
 * A setting's name. Free text within a shape, for the same reason metric keys
 * are: a mod that starts syncing something new just writes it, and nothing here
 * is redeployed.
 *
 * Narrower than "any string" because the key travels in a URL path. Lowercase
 * letters, digits, `_`, `-` and `.`, so namespacing is possible
 * (`nickname`, `chat.color`) and nothing needs percent-encoding. Normalised to
 * lower case on the way in, so two mods cannot end up with `Nickname` and
 * `nickname` as two different settings.
 */
export const SETTING_KEY_MAX_LENGTH = 64;
export const settingKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(SETTING_KEY_MAX_LENGTH)
  .regex(
    /^[a-z0-9][a-z0-9_.-]*$/,
    'setting keys are lowercase letters, digits, underscore, dash and dot',
  );
export type SettingKey = z.infer<typeof settingKeySchema>;

/**
 * A setting's value. Any string, and stored exactly as sent: no trimming, so a
 * value with meaningful whitespace round trips. Empty is a value, and is not
 * the same as deleting the setting.
 *
 * Counted in characters rather than bytes. A mod that needs more than this is
 * syncing a document, not a setting.
 */
export const SETTING_VALUE_MAX_LENGTH = 1024;
export const settingValueSchema = z.string().max(SETTING_VALUE_MAX_LENGTH);

/**
 * How many settings one player may have. A ceiling against a mod with a bug in
 * a loop, not a budget anybody is expected to approach.
 */
export const PLAYER_SETTINGS_LIMIT = 100;

/** The path of every settings route: which player, and for the single ones, which key. */
export const playerSettingsParamsSchema = z.object({ uuid: mcUuidSchema });
export const playerSettingParamsSchema = z.object({ uuid: mcUuidSchema, key: settingKeySchema });

/** What a plugin sends to set one setting. */
export const putSettingSchema = z.object({ value: settingValueSchema });
export type PutSettingInput = z.infer<typeof putSettingSchema>;

export const playerSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  updatedAt: z.iso.datetime(),
});
export type PlayerSetting = z.infer<typeof playerSettingSchema>;

/**
 * Every setting a player has, as a plain key to value map. That is the shape a
 * mod wants on join: apply what is there, ignore what it does not know.
 */
export const playerSettingsSchema = z.object({
  uuid: z.string(),
  settings: z.record(z.string(), z.string()),
});
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;
