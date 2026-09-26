import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Reversible encryption for the one secret we are forced to be able to read
 * back: the account system's refresh token.
 *
 * Hashing is not an option there the way it is for our own session tokens,
 * because the token has to be sent back to the account system to be exchanged.
 * Encrypting it under a key that lives outside the database means an SQL dump
 * alone does not hand anyone a working set of sessions against smto.dev
 * accounts.
 *
 * Nothing else goes through this. Session tokens and API tokens are SHA-256,
 * one way, because nothing ever needs their plaintext again.
 */
@Injectable()
export class SecretCipherService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const configured: string = config.get('SESSION_ENC_KEY', { infer: true });
    this.key = Buffer.from(configured, 'base64');

    if (this.key.length !== 32) {
      throw new Error('SESSION_ENC_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // iv:tag:ciphertext, so the format carries everything decryption needs.
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
      ':',
    );
  }

  decrypt(encoded: string): string {
    const [ivPart, tagPart, dataPart] = encoded.split(':');

    if (!ivPart || !tagPart || !dataPart) {
      throw new Error('Malformed encrypted secret');
    }

    const authTag = Buffer.from(tagPart, 'base64');
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Malformed encrypted secret');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(authTag);

    // GCM verifies the tag on final(), so tampering throws rather than
    // returning plausible-looking rubbish.
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
