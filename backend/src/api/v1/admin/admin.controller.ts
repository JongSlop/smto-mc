import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_ROLE,
  ASSET_MAX_BYTES,
  assetFilenameSchema,
  auditQuerySchema,
  createApiTokenSchema,
  createServerSchema,
  updateServerSchema,
  type ApiToken,
  type ApiTokenWithSecret,
  type AuditPage,
  type AuditQuery,
  type CreateApiTokenInput,
  type CreateServerInput,
  type ServerAsset,
  type ServerMeta,
  type UpdateServerInput,
} from '@smto/mc-contracts';
import type { Request } from 'express';

import { AssetsService, parseContentType, sniffContentType } from '../../../assets/assets.service';
import { AuditService } from '../../../audit/audit.service';
import { ClientIp } from '../../../common/decorators/client-ip.decorator';
import { readRawBody } from '../../../common/http/raw-body';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodBody, ZodQuery } from '../../../common/pipes/zod.decorators';
import type { RequestUser } from '../../../common/types/request-user';
import { ServersService } from '../../../servers/servers.service';
import { TokensService } from '../../../tokens/tokens.service';

/**
 * The admin area.
 *
 * Gated on the `admin` role from the account system's `roles` claim, which is
 * re-read on a schedule rather than trusted for the life of a session, so a
 * demotion takes effect here within ROLE_REFRESH_MINUTES. Plugin tokens cannot
 * reach any of this: the guard only ever gives them scopes, never roles.
 */
@ApiTags('admin')
@Roles(ADMIN_ROLE)
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly servers: ServersService,
    private readonly assets: AssetsService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  // --- servers ---

  /** Includes servers hidden from the public endpoint, which is the point. */
  @Get('servers')
  @ApiOperation({ summary: 'Every server, including hidden ones' })
  listServers(): Promise<ServerMeta[]> {
    return this.servers.list({ includeHidden: true });
  }

  @Get('servers/:id')
  getServer(@Param('id') id: string): Promise<ServerMeta> {
    return this.servers.get(id, { includeHidden: true });
  }

  @Post('servers')
  createServer(
    @ZodBody(createServerSchema) body: CreateServerInput,
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<ServerMeta> {
    return this.servers.create(body, { accountId: user.id, ipAddress });
  }

  @Patch('servers/:id')
  updateServer(
    @Param('id') id: string,
    @ZodBody(updateServerSchema) body: UpdateServerInput,
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<ServerMeta> {
    return this.servers.update(id, body, { accountId: user.id, ipAddress });
  }

  @Delete('servers/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a server and everything recorded for it' })
  deleteServer(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<void> {
    return this.servers.remove(id, { accountId: user.id, ipAddress });
  }

  // --- server assets ---

  @Get('servers/:id/assets')
  @ApiOperation({ summary: 'Images uploaded for a server' })
  listAssets(@Param('id') id: string): Promise<ServerAsset[]> {
    return this.assets.list(id);
  }

  /**
   * Uploads one image, as a raw body rather than as multipart.
   *
   * The file is the whole request: its type is the content type header and its
   * name is a query parameter. That keeps a file upload dependency out of the
   * backend and puts the size limit in one place, and the frontend has to
   * unwrap the browser's multipart form anyway because it validates and
   * forwards rather than proxying blind.
   *
   * The name is not a key. Uploading over an existing name replaces the bytes
   * and keeps the address, which is what somebody correcting an icon wants.
   */
  @Post('servers/:id/assets')
  @ApiOperation({ summary: 'Upload an image for a server' })
  async uploadAsset(
    @Param('id') id: string,
    @Query('filename') filename: string,
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<ServerAsset> {
    const declaredType = parseContentType(request.headers['content-type']);

    if (!declaredType) {
      throw new UnsupportedMediaTypeException('unsupported_asset_type');
    }

    const name = assetFilenameSchema.safeParse(filename);

    if (!name.success) {
      throw new BadRequestException('invalid_asset_filename');
    }

    const data = await readRawBody(request, ASSET_MAX_BYTES);

    if (data.byteLength === 0) {
      throw new BadRequestException('empty_asset');
    }

    // The header is a claim; the signature is the file itself. Anything served
    // from our own origin has to be what it says it is.
    if (sniffContentType(data) !== declaredType) {
      throw new UnsupportedMediaTypeException('asset_type_mismatch');
    }

    return this.assets.upload(
      id,
      { filename: name.data, contentType: declaredType, data },
      { accountId: user.id, ipAddress },
    );
  }

  @Delete('servers/:id/assets/:assetId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an uploaded image' })
  deleteAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<void> {
    return this.assets.remove(id, assetId, { accountId: user.id, ipAddress });
  }

  // --- API tokens ---

  @Get('tokens')
  listTokens(): Promise<ApiToken[]> {
    return this.tokens.list();
  }

  /** The only response that ever carries the token itself. */
  @Post('tokens')
  @ApiOperation({ summary: 'Issue a plugin token. The secret is shown once.' })
  createToken(
    @ZodBody(createApiTokenSchema) body: CreateApiTokenInput,
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<ApiTokenWithSecret> {
    return this.tokens.create(body, { accountId: user.id, ipAddress });
  }

  @Delete('tokens/:id')
  @ApiOperation({ summary: 'Revoke a token, keeping its row for the audit trail' })
  revokeToken(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<ApiToken> {
    return this.tokens.revoke(id, { accountId: user.id, ipAddress });
  }

  // --- audit ---

  @Get('audit')
  listAudit(@ZodQuery(auditQuerySchema) query: AuditQuery): Promise<AuditPage> {
    return this.audit.list(query);
  }
}
