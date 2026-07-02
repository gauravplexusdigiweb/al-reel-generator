import { Global, Module } from '@nestjs/common';
import { OllamaProvider } from './ollama.provider';
import { LlmService } from './llm.service';

@Global()
@Module({
  providers: [OllamaProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
