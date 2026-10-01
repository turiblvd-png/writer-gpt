/**
 * Provider-agnostic LLM contract.
 *
 * Every pipeline step talks to this interface, never to a vendor SDK, so a step
 * can be re-pointed at a different model by changing config alone. Grounding is
 * part of the contract rather than a Gemini extra, because the quality problems
 * this product exists to solve (stale facts, invented specifics) are only
 * fixable when a step can demand real retrieved sources.
 */

export type ProviderId = 'gemini' | 'deepseek' | 'grok';

export interface Source {
  uri: string;
  title?: string;
  domain?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface CompletionRequest {
  /** Rendered user prompt. */
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Ask the provider for web-grounded output. Providers that cannot ground
   * throw rather than silently returning ungrounded text — a step that needs
   * facts must never get invented ones back.
   */
  grounded?: boolean;
  /**
   * Request strict JSON. Mutually exclusive with `grounded` on Gemini, so the
   * pipeline splits "research" and "structure" into separate steps.
   */
  json?: boolean;
  /** URLs the model should read directly, when the provider supports it. */
  readUrls?: string[];
  signal?: AbortSignal;
  /** Use exactly this model: no quota step-down. For the dashboard's key test. */
  exact?: boolean;
}

export interface CompletionResult {
  text: string;
  sources: Source[];
  /** Search queries the provider actually issued, when it reports them. */
  searchQueries: string[];
  usage: TokenUsage;
  model: string;
  provider: ProviderId;
}

export interface LlmProvider {
  readonly id: ProviderId;
  readonly supportsGrounding: boolean;
  readonly supportsUrlContext: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** Raised when a step asked for grounding a provider cannot deliver. */
export class GroundingUnsupportedError extends Error {
  constructor(provider: ProviderId) {
    super(
      `Provider "${provider}" cannot ground responses in live search. ` +
        `Route this step to a grounding-capable provider (gemini) or drop the grounded flag.`,
    );
    this.name = 'GroundingUnsupportedError';
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: ProviderId, envVar: string) {
    super(`No ${provider} API key. Add one under Developer → AI Models (or set ${envVar}).`);
    this.name = 'ProviderNotConfiguredError';
  }
}
