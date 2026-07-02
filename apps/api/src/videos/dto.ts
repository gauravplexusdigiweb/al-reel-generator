import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export const ASPECT_RATIOS = ['9:16', '1:1', '4:5'] as const;

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
  @IsIn(ASPECT_RATIOS)
  aspectRatio?: string;
}
