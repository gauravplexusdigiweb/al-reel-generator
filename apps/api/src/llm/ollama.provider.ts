import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import type { AppConfig } from '../config/configuration';

export interface LlmCompleteOptions {
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
}

/** Minimal provider surface so the model/vendor can be swapped via config. */
export interface LlmProvider {
  isAvailable(): Promise<boolean>;
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<string>;
}

@Injectable()
export class OllamaProvider implements LlmProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly http: AxiosInstance;
  private readonly model: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const cfg = config.get('llm', { infer: true });
    this.model = cfg.ollamaModel;
    this.http = axios.create({ baseURL: cfg.ollamaBaseUrl });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.http.get('/api/tags', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async complete(prompt: string, opts: LlmCompleteOptions = {}): Promise<string> {
    const { data } = await this.http.post(
      '/api/generate',
      {
        model: this.model,
        prompt,
        stream: false,
        ...(opts.json ? { format: 'json' } : {}),
        options: { temperature: opts.temperature ?? 0.3 },
      },
      { timeout: opts.timeoutMs ?? 60_000 },
    );
    return (data as { response?: string }).response ?? '';
  }
}
