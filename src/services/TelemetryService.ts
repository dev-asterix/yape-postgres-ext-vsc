import * as vscode from 'vscode';

/**
 * Lightweight telemetry service for performance monitoring.
 * 
 * Uses a simple span-based tracing model compatible with OpenTelemetry concepts.
 * Disabled by default - must be explicitly enabled via settings.
 * 
 * Privacy-first design:
 * - No query content is logged (only duration and row counts)
 * - No PII or connection details
 * - Opt-in only
 */
export class TelemetryService {
  private static instance: TelemetryService;
  private enabled: boolean = false;
  private outputChannel: vscode.OutputChannel | null = null;
  private spans: Map<string, SpanData> = new Map();

  private constructor() {
    this.loadSettings();
  }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Initialize the telemetry service
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.loadSettings();

    // Listen for settings changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('postgresExplorer.telemetry')) {
          this.loadSettings();
        }
      })
    );

    if (this.enabled) {
      this.outputChannel = vscode.window.createOutputChannel('PgStudio Telemetry');
      this.log('Telemetry initialized');
    }
  }

  /**
   * Load settings from VS Code configuration
   */
  private loadSettings(): void {
    const config = vscode.workspace.getConfiguration('postgresExplorer.telemetry');
    this.enabled = config.get<boolean>('enabled', false);
  }

  /**
   * Check if telemetry is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start a new span for tracing an operation
   */
  public startSpan(name: string, attributes?: Record<string, string | number>): string {
    if (!this.enabled) return '';

    const spanId = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.spans.set(spanId, {
      name,
      startTime: Date.now(),
      attributes: attributes || {},
      status: 'running'
    });

    this.log(`[START] ${name}`, attributes);
    return spanId;
  }

  /**
   * End a span and record its duration
   */
  public endSpan(spanId: string, attributes?: Record<string, string | number>): void {
    if (!this.enabled || !spanId) return;

    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = 'completed';

    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    this.log(`[END] ${span.name} (${span.duration}ms)`, span.attributes);
    this.spans.delete(spanId);
  }

  /**
   * Record an error in a span
   */
  public recordError(spanId: string, error: Error): void {
    if (!this.enabled || !spanId) return;

    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = 'error';
    span.error = error.message;

    this.log(`[ERROR] ${span.name} (${span.duration}ms): ${error.message}`);
    this.spans.delete(spanId);
  }

  /**
   * Record a metric value
   */
  public recordMetric(name: string, value: number, unit?: string): void {
    if (!this.enabled) return;

    this.log(`[METRIC] ${name}: ${value}${unit ? ` ${unit}` : ''}`);
  }

  /**
   * Log a message to the telemetry output channel
   */
  private log(message: string, attributes?: Record<string, string | number>): void {
    if (!this.outputChannel) return;

    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] ${message}`;

    if (attributes && Object.keys(attributes).length > 0) {
      const attrStr = Object.entries(attributes)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      logLine += ` {${attrStr}}`;
    }

    this.outputChannel.appendLine(logLine);
  }

  /**
   * Wrap an async function with automatic span tracking
   */
  public async trace<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, string | number>
  ): Promise<T> {
    const spanId = this.startSpan(name, attributes);

    try {
      const result = await fn();
      this.endSpan(spanId);
      return result;
    } catch (error) {
      this.recordError(spanId, error as Error);
      throw error;
    }
  }

  /**
   * Get telemetry summary for debugging
   */
  public getSummary(): TelemetrySummary {
    return {
      enabled: this.enabled,
      activeSpans: this.spans.size,
      spanNames: Array.from(this.spans.values()).map(s => s.name)
    };
  }
}

/**
 * Internal span data structure
 */
interface SpanData {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, string | number>;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

/**
 * Telemetry summary for debugging
 */
export interface TelemetrySummary {
  enabled: boolean;
  activeSpans: number;
  spanNames: string[];
}

/**
 * Common span names for consistency
 */
export const SpanNames = {
  QUERY_EXECUTE: 'query.execute',
  QUERY_STREAM: 'query.stream',
  POOL_ACQUIRE: 'pool.acquire',
  POOL_RELEASE: 'pool.release',
  AI_REQUEST: 'ai.request',
  AI_GENERATE: 'ai.generate',
  AI_OPTIMIZE: 'ai.optimize',
  EXTENSION_ACTIVATE: 'extension.activate',
  TREE_REFRESH: 'tree.refresh',
  NOTEBOOK_EXECUTE: 'notebook.execute',
  EXPORT_DATA: 'export.data'
} as const;
