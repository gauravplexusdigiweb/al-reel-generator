import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ASPECT_RATIOS } from '@arg/shared';

export class CreateReelDto {
  @ApiProperty({ description: 'Clip start (seconds, absolute in source video)' })
  @IsNumber()
  @Min(0)
  startSec!: number;

  @ApiProperty({ description: 'Clip end (seconds, absolute in source video)' })
  @IsNumber()
  @Min(0)
  endSec!: number;

  @ApiPropertyOptional({ description: 'Nominal duration bucket label (seconds)' })
  @IsOptional()
  @IsNumber()
  durationBucket?: number;

  @ApiPropertyOptional({ enum: ASPECT_RATIOS })
  @IsOptional()
  @IsString()
  aspectRatio?: string;
}

export class MoveVideoDto {
  @ApiPropertyOptional({ description: 'Target category ID (null = uncategorized)' })
  @IsOptional()
  @IsString()
  categoryId?: string | null;
}

/** Multipart upload options — fields arrive as strings and are coerced in the service. */
export class UploadOptions {
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ enum: ['reel', 'teaser'] }) @IsOptional() @IsString() outputType?: string;
  @ApiPropertyOptional({ description: 'Adult filter 0=off..100=strictest' }) @IsOptional() @IsString() adultThreshold?: string;
  @ApiPropertyOptional({ description: 'Teaser variants 1..5' }) @IsOptional() @IsString() teaserCount?: string;
  @ApiPropertyOptional({ enum: ['original', 'custom', 'none'] }) @IsOptional() @IsString() musicSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() captionsEnabled?: string;
}
