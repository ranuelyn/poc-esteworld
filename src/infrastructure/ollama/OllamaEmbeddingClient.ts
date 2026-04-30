import type { EmbeddingPort } from "../../domain/ports/EmbeddingPort.js";
import { env } from "../../config/env.js";

interface EmbedResponse {
  embeddings?: number[][];
  embedding?: number[];
}

export class OllamaEmbeddingClient implements EmbeddingPort {
  constructor(
    private readonly baseUrl = env.OLLAMA_BASE_URL,
    private readonly model = env.OLLAMA_EMBEDDING_MODEL,
    private readonly timeoutMs = env.OLLAMA_REQUEST_TIMEOUT_MS
  ) {}

  async embed(text: string): Promise<number[]> {
    const normalizedText = text.trim();
    if (!normalizedText) {
      throw new Error("Cannot embed empty text.");
    }

    const response = await this.requestEmbed(normalizedText);
    const vector = response.embeddings?.[0] ?? response.embedding;

    if (!vector?.length) {
      throw new Error(`Ollama did not return an embedding for model "${this.model}".`);
    }

    return vector;
  }

  private async requestEmbed(text: string): Promise<EmbedResponse> {
    const modernResponse = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: text
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (modernResponse.ok) {
      return (await modernResponse.json()) as EmbedResponse;
    }

    const modernError = await modernResponse.text();
    if (modernResponse.status !== 404) {
      throw new Error(
        `Ollama embed request failed with status ${modernResponse.status}: ${modernError}`
      );
    }

    const legacyResponse = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: text
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!legacyResponse.ok) {
      const legacyError = await legacyResponse.text();
      throw new Error(
        `Ollama embedding model "${this.model}" is unavailable. /api/embed returned 404 (${modernError}); /api/embeddings returned ${legacyResponse.status} (${legacyError}).`
      );
    }

    return (await legacyResponse.json()) as EmbedResponse;
  }
}
