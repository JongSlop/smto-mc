import { INestApplication } from '@nestjs/common';
import { PLAYTIME_METRIC } from '@smto/mc-contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { createApiToken, createServer, createTestApp, resetDatabase } from './helpers';

/**
 * The plugin contract, exercised exactly as a plugin would: an API token, HTTP,
 * no Minecraft server in the loop. This suite is what keeps docs/api.md honest
 * while the plugin is being written in parallel against it.
 */
describe('POST /api/v1/ingest', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  // Playtime is now just a metric. These cases were written against the old
  // /ingest/playtime shortcut and are kept because what they cover, the counter
  // rule and batch semantics, is unchanged by the route going away.
  describe('playtime, as a metric', () => {
    it('stores a total and reports it accepted', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });

      const response = await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'i5', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 7200 }] })
        .expect(200);

      expect(response.body).toEqual({ accepted: 1, rejected: [] });

      const stored = await prisma.playerMetric.findFirst({ where: { mcUuid: NOTCH } });
      expect(stored?.metric).toBe(PLAYTIME_METRIC);
      expect(stored?.valueNum).toBe(7200n);
    });

    it('is idempotent, so a retried flush does not double the playtime', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });
      const body = {
        serverId: 'i5',
        entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 7200 }],
      };

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send(body)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send(body)
        .expect(200);

      const rows = await prisma.playerMetric.findMany({ where: { mcUuid: NOTCH } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.valueNum).toBe(7200n);
    });

    it('refuses a total lower than the one stored and keeps the old value', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'i5', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 7200 }] })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'i5', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 10 }] })
        .expect(200);

      expect(response.body.accepted).toBe(0);
      expect(response.body.rejected).toEqual([
        { uuid: NOTCH, metric: PLAYTIME_METRIC, reason: 'counter_went_backwards' },
      ]);

      const stored = await prisma.playerMetric.findFirst({ where: { mcUuid: NOTCH } });
      expect(stored?.valueNum).toBe(7200n);

      // A rejection leaves a trace, because somebody has to be able to find out
      // later why a player's playtime stopped moving.
      const audit = await prisma.auditLog.findFirst({ where: { action: 'metric_rejected' } });
      expect(audit).not.toBeNull();
    });

    it('writes the rest of a batch when one entry is refused', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });
      const other = '853c80ef-3c37-49fd-aa49-938b674adae6';

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'i5', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 7200 }] })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({
          serverId: 'i5',
          entries: [
            { uuid: NOTCH, metric: PLAYTIME_METRIC, value: 10 },
            { uuid: other, metric: PLAYTIME_METRIC, value: 500 },
          ],
        })
        .expect(200);

      expect(response.body.accepted).toBe(1);
      expect(response.body.rejected).toHaveLength(1);

      const stored = await prisma.playerMetric.findFirst({ where: { mcUuid: other } });
      expect(stored?.valueNum).toBe(500n);
    });

    it('accepts an undashed UUID and stores it dashed', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({
          serverId: 'i5',
          entries: [{ uuid: NOTCH.replace(/-/g, ''), metric: PLAYTIME_METRIC, value: 60 }],
        })
        .expect(200);

      const stored = await prisma.playerMetric.findFirst();
      expect(stored?.mcUuid).toBe(NOTCH);
    });

    it('rejects the batch for a server that does not exist', async () => {
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });

      const response = await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'nope', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 60 }] })
        .expect(200);

      expect(response.body.accepted).toBe(0);
      expect(response.body.rejected[0].reason).toBe('unknown_server');
    });

    it('will not let a pinned token write another server', async () => {
      await createServer(prisma, 'i5');
      await createServer(prisma, 'i4');
      const token = await createApiToken(prisma, { scopes: ['stats:write'], serverId: 'i5' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'i4', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 60 }] })
        .expect(200);

      expect(response.body.accepted).toBe(0);
      expect(response.body.rejected[0].reason).toBe('unknown_server');
      expect(await prisma.playerMetric.count()).toBe(0);
    });
  });

  describe('metrics', () => {
    it('stores any metric name without a schema change', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({
          serverId: 'i5',
          entries: [
            { uuid: NOTCH, metric: 'blocks_mined', value: 48213 },
            { uuid: NOTCH, metric: 'biome_visits', data: { plains: 4, desert: 1 } },
          ],
        })
        .expect(200);

      const rows = await prisma.playerMetric.findMany({ orderBy: { metric: 'asc' } });
      expect(rows.map((row) => row.metric)).toEqual(['biome_visits', 'blocks_mined']);
      expect(rows[0]?.valueJson).toEqual({ plains: 4, desert: 1 });
    });

    it('refuses an entry carrying both a value and a data object', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({
          serverId: 'i5',
          entries: [{ uuid: NOTCH, metric: 'blocks_mined', value: 1, data: { a: 1 } }],
        })
        .expect(400);
    });
  });

  describe('authentication', () => {
    it('refuses a request with no credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .send({ serverId: 'i5', entries: [] })
        .expect(401);
    });

    it('refuses a token that does not hold the scope', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['link:read'] });

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'i5', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 1 }] })
        .expect(403);
    });

    it('refuses a revoked token', async () => {
      await createServer(prisma);
      const token = await createApiToken(prisma, { scopes: ['stats:write'] });
      await prisma.apiToken.updateMany({ data: { revokedAt: new Date() } });

      await request(app.getHttpServer())
        .post('/api/v1/ingest/metrics')
        .set('X-Api-Key', token)
        .send({ serverId: 'i5', entries: [{ uuid: NOTCH, metric: PLAYTIME_METRIC, value: 1 }] })
        .expect(401);
    });
  });
});
