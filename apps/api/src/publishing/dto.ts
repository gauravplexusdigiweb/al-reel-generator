import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import type { SocialPlatform } from '@arg/shared';

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
  @ApiProperty({ description: 'OAuth authorization code from the platform' })
  @IsString()
  authCode!: string;

  @ApiPropertyOptional({ description: 'Display name for this account' })
  @IsOptional()
  @IsString()
  displayName?: string;
}
