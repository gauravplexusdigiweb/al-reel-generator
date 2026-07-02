import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiClientService } from '../ai/ai-client.service';
import { LlmService } from '../llm/llm.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly ai: AiClientService,
    private readonly llm: LlmService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  root() {
    return { status: 'ok' };
  }

  @Get('services')
  @ApiOperation({ summary: 'Reachability of external dependencies (ai-service, Ollama)' })
  async services() {
    const [aiService, ollama] = await Promise.all([
      this.ai.isAvailable(),
      this.llm.raw.isAvailable(),
    ]);
    return { aiService, ollama, degraded: !aiService || !ollama };
  }
}
