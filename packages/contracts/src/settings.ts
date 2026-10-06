import { z } from 'zod';

import { mcUuidSchema } from './minecraft.js';
import { normaliseProfileMessage } from './profile.js';

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

/**
 * The settings the website itself knows about, and the only ones it will write.
 *
 * The plugin API treats every key alike. The website cannot: a person typing in
 * a browser is a different thing from a mod that was written against this
 * document, so a browser may only touch the keys listed in
 * `WEB_EDITABLE_SETTINGS`, each with a rule for what a valid value is. Reading
 * is not restricted, since the page lists everything stored.
 */
export const NICKNAME_SETTING = 'nickname';
export const PREFERRED_LANGUAGE_SETTING = 'preferred_language';

/**
 * Languages the website is translated into. The one definition of the list, so
 * the language switcher and the stored `preferred_language` cannot disagree
 * about what is valid.
 */
export const SITE_LANGUAGES = ['en', 'de'] as const;
export type SiteLanguage = (typeof SITE_LANGUAGES)[number];

/** Short enough to sit above a head or in a chat line, in characters a person would count. */
export const NICKNAME_MAX = 32;

/**
 * What a nickname is once it is safe to show to other players.
 *
 * The same cleanup as the profile message, so a pasted newline or a
 * right-to-left override cannot make a name read backwards, plus the section
 * sign: Minecraft treats `§` as the start of a legacy colour or format code, so
 * leaving it in would let somebody style their name, or break out of the style
 * of the line it is printed in.
 */
export function normaliseNickname(value: string): string {
  return normaliseProfileMessage(value.replace(/\u00A7/g, ''));
}

/**
 * A rule for one web-editable setting. Parses what was typed into what is
 * stored, where `null` means the setting is removed rather than stored empty.
 */
const nicknameValueSchema = z
  .string()
  .max(1000)
  .transform((value) => normaliseNickname(value) || null)
  .refine((value) => value === null || [...value].length <= NICKNAME_MAX, {
    message: `at most ${NICKNAME_MAX} characters`,
  });

export const WEB_EDITABLE_SETTINGS: Readonly<Record<string, z.ZodType<string | null>>> = {
  [NICKNAME_SETTING]: nicknameValueSchema,
  [PREFERRED_LANGUAGE_SETTING]: z.enum(SITE_LANGUAGES),
};

/** The body of `PUT /me/settings/{key}`. Checked against the key's own rule afterwards. */
export const putMySettingSchema = z.object({ value: z.string().max(1000) });
export type PutMySettingInput = z.infer<typeof putMySettingSchema>;
export const mySettingParamsSchema = z.object({ key: settingKeySchema });

/** What the signed-in person's own settings come back as. */
export const mySettingResultSchema = z.object({
  key: z.string(),
  /** Null when the write removed the setting. */
  value: z.string().nullable(),
});
export type MySettingResult = z.infer<typeof mySettingResultSchema>;
