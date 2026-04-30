export interface EmbeddingPort {
  embed(text: string): Promise<number[]>;
}
