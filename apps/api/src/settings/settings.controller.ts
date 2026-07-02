import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EffectiveSettings, SettingsService } from './settings.service';

class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) candidateMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) candidateMax?: number;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @ArrayNotEmpty()
  durationBuckets?: number[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10) sampleFps?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() retainIntermediates?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() captionPreset?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() karaoke?: boolean;
}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get effective pipeline settings' })
  get(): Promise<EffectiveSettings> {
    return this.settings.effective();
  }

  @Put()
  @ApiOperation({ summary: 'Update pipeline settings (applies to future runs)' })
  update(@Body() body: UpdateSettingsDto): Promise<EffectiveSettings> {
    return this.settings.update(body);
  }
}
