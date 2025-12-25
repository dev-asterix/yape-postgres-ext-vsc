import Cursor from 'pg-cursor';
import { PoolClient } from 'pg';

/**
 * Service for streaming large query results using PostgreSQL cursors.
 * 
 * Instead of loading all rows into memory at once, this service uses
 * cursors to fetch rows in batches, reducing memory usage and
 * improving time-to-first-row.
 */
export class StreamingQueryService {
  private static instance: StreamingQueryService;

  public static getInstance(): StreamingQueryService {
    if (!StreamingQueryService.instance) {
      StreamingQueryService.instance = new StreamingQueryService();
    }
    return StreamingQueryService.instance;
  }

  /**
   * Stream query results in batches using a cursor.
   * 
   * @param client - The database client to use
   * @param query - The SQL query to execute
   * @param batchSize - Number of rows per batch (default: 200)
   * @returns AsyncGenerator yielding batches of rows with metadata
   */
  public async *streamQuery(
    client: PoolClient,
    query: string,
    batchSize: number = 200
  ): AsyncGenerator<StreamBatch, void, unknown> {
    const cursor = client.query(new Cursor(query));
    let totalRows = 0;
    let isFirstBatch = true;

    try {
      while (true) {
        const rows = await cursor.read(batchSize);

        if (rows.length === 0) {
          break;
        }

        totalRows += rows.length;

        yield {
          rows,
          fields: (cursor as any)._result?.fields || [],
          batchNumber: Math.floor((totalRows - 1) / batchSize) + 1,
          isFirstBatch,
          isComplete: rows.length < batchSize,
          totalRowsSoFar: totalRows
        };

        isFirstBatch = false;
      }
    } finally {
      await cursor.close();
    }
  }

  /**
   * Execute a query with streaming support if beneficial.
   * Falls back to regular query for small result sets or unsupported queries.
   * 
   * @param client - The database client to use
   * @param query - The SQL query to execute
   * @param options - Streaming options
   * @returns Query result or streaming generator
   */
  public async executeWithStreaming(
    client: PoolClient,
    query: string,
    options: StreamingOptions = {}
  ): Promise<StreamingResult> {
    const {
      enableStreaming = true,
      batchSize = 200,
      maxRowsBeforeStreaming = 1000
    } = options;

    // Check if streaming is appropriate
    const shouldStream = enableStreaming &&
      this.isStreamableQuery(query) &&
      !this.hasExplicitLimit(query, maxRowsBeforeStreaming);

    if (shouldStream) {
      return {
        type: 'streaming',
        generator: this.streamQuery(client, query, batchSize)
      };
    } else {
      // Fall back to regular query
      const result = await client.query(query);
      return {
        type: 'immediate',
        result
      };
    }
  }

  /**
   * Check if a query is suitable for streaming.
   * SELECT queries without aggregations are good candidates.
   */
  private isStreamableQuery(query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();

    // Only SELECT queries can be streamed
    if (!normalizedQuery.startsWith('select')) {
      return false;
    }

    // Queries with aggregations don't benefit from streaming
    const aggregationKeywords = ['count(', 'sum(', 'avg(', 'min(', 'max(', 'group by'];
    for (const keyword of aggregationKeywords) {
      if (normalizedQuery.includes(keyword)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if query has an explicit LIMIT that's small enough
   * to not need streaming.
   */
  private hasExplicitLimit(query: string, maxRows: number): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    const limitMatch = normalizedQuery.match(/limit\s+(\d+)/);

    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      return limit <= maxRows;
    }

    return false;
  }
}

/**
 * A batch of streamed rows
 */
export interface StreamBatch {
  /** The rows in this batch */
  rows: any[];
  /** Field metadata (column names, types) */
  fields: any[];
  /** Batch number (1-indexed) */
  batchNumber: number;
  /** Whether this is the first batch */
  isFirstBatch: boolean;
  /** Whether this is the last batch */
  isComplete: boolean;
  /** Total rows fetched so far */
  totalRowsSoFar: number;
}

/**
 * Options for streaming query execution
 */
export interface StreamingOptions {
  /** Whether to enable streaming (default: true) */
  enableStreaming?: boolean;
  /** Rows per batch (default: 200) */
  batchSize?: number;
  /** Max rows before using streaming (default: 1000) */
  maxRowsBeforeStreaming?: number;
}

/**
 * Result from executeWithStreaming
 */
export type StreamingResult =
  | { type: 'streaming'; generator: AsyncGenerator<StreamBatch, void, unknown> }
  | { type: 'immediate'; result: any };
