import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class PublishReelDto {
  @ApiProperty({ type: [String], description: 'Social account IDs to publish to' })
  @IsArray()
  @IsString({ each: true })
  accountIds!: string[];

  @ApiPropertyOptional({ description: 'Custom caption (defaults to reel title)' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ type: [String], description: 'Hashtags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ description: 'Schedule for later (ISO 8601 datetime)' })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Thumbnail ID to use as cover' })
  @IsOptional()
  @IsString()
  thumbnailId?: string;
}

export class ConnectAccountDto {
  @ApiProperty({
    description: 'Access token for the platform. For "webhook", put the destination URL here.',
  })
  @IsString()
  accessToken!: string;

  @ApiPropertyOptional({ description: 'Refresh token (if the platform provides one)' })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'Display name for this account' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Platform-specific metadata, e.g. { igUserId }' })
  @IsOptional()
  @IsObject()
  platformMeta?: Record<string, unknown>;
}

export class ManualAnalyticsDto {
  @ApiProperty({ enum: ['instagram', 'youtube', 'tiktok', 'webhook'] })
  @IsString()
  platform!: string;

  @ApiPropertyOptional() @IsOptional() views?: number;
  @ApiPropertyOptional() @IsOptional() likes?: number;
  @ApiPropertyOptional() @IsOptional() comments?: number;
  @ApiPropertyOptional() @IsOptional() shares?: number;
  @ApiPropertyOptional() @IsOptional() watchTime?: number;
  @ApiPropertyOptional() @IsOptional() completionRate?: number;
}
