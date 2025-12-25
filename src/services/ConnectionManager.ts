import { Client, Pool, PoolClient, ClientConfig, PoolConfig } from 'pg';
import * as fs from 'fs';
import { ConnectionConfig } from '../common/types';
import { SecretStorageService } from './SecretStorageService';
import { SSHService } from './SSHService';

export class ConnectionManager {
  private static instance: ConnectionManager;
  private pools: Map<string, Pool> = new Map();
  private sessions: Map<string, Client> = new Map();

  private constructor() { }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Get a pooled client for ephemeral operations (metadata, autocomplete, etc.)
   * Callers MUST release the client when done.
   */
  public async getPooledClient(config: ConnectionConfig): Promise<PoolClient> {
    const key = this.getConnectionKey(config);

    let pool = this.pools.get(key);
    if (!pool) {
      const clientConfig = await this.createClientConfig(config);
      // Pool specific configuration
      const poolConfig: PoolConfig = {
        ...clientConfig,
        max: 10, // Max connections per config
        idleTimeoutMillis: 30000 // Close idle clients after 30s
      };

      pool = new Pool(poolConfig);

      pool.on('error', (err) => {
        console.error(`Unexpected error on idle client for ${key}`, err);
        // Don't remove pool, just log. Connection issues will be caught on next checkout.
      });

      this.pools.set(key, pool);
    }

    return await pool.connect();
  }

  /**
   * Get a persistent client for a specific session (Notebooks, Transactions).
   * Caller is responsible for eventually closing this session calling removeSession.
   */
  public async getSessionClient(config: ConnectionConfig, sessionId: string): Promise<Client> {
    const key = `${this.getConnectionKey(config)}:session:${sessionId}`;

    if (this.sessions.has(key)) {
      const client = this.sessions.get(key)!;
      // Should add a liveness check here ideally
      return client;
    }

    const clientConfig = await this.createClientConfig(config);
    const client = new Client(clientConfig);

    await client.connect();

    client.on('end', () => this.sessions.delete(key));
    client.on('error', (err) => {
      console.error(`Session client error for ${key}`, err);
      this.sessions.delete(key);
    });

    this.sessions.set(key, client);
    return client;
  }



  public async closeSession(config: ConnectionConfig, sessionId: string): Promise<void> {
    const key = `${this.getConnectionKey(config)}:session:${sessionId}`;
    const client = this.sessions.get(key);
    if (client) {
      try {
        // Restore original end if present (unlikely for session client but good practice)
        await client.end();
      } catch (e) {
        console.error(`Error closing session ${key}:`, e);
      } finally {
        this.sessions.delete(key);
      }
    }
  }

  /**
   * Close all pools and sessions for a given connection ID (e.g. on disconnect/edit)
   */
  public async closeConnection(config: ConnectionConfig): Promise<void> {
    const baseKey = this.getConnectionKey(config);

    // Close Pool
    const pool = this.pools.get(baseKey);
    if (pool) {
      try {
        await pool.end();
      } catch (e) { console.error(`Error closing pool ${baseKey}`, e); }
      this.pools.delete(baseKey);
    }

    // Close all related sessions
    for (const [key, client] of this.sessions.entries()) {
      if (key.startsWith(baseKey)) {
        try {
          await client.end();
        } catch (e) { console.error(`Error closing session ${key}`, e); }
        this.sessions.delete(key);
      }
    }
  }

  // Helper to remove all connections for a connection ID regardless of DB
  public async closeAllConnectionsById(connectionId: string): Promise<void> {
    // Create a list of keys to remove to avoid modification during iteration
    const poolKeysToRemove: string[] = [];
    for (const key of this.pools.keys()) {
      if (key.startsWith(`${connectionId}:`)) {
        poolKeysToRemove.push(key);
      }
    }

    for (const key of poolKeysToRemove) {
      const pool = this.pools.get(key);
      if (pool) {
        await pool.end().catch(e => console.error(`Error ending pool ${key}`, e));
        this.pools.delete(key);
      }
    }

    const sessionKeysToRemove: string[] = [];
    for (const key of this.sessions.keys()) {
      // keys are "id:db:session:sessId"
      if (key.startsWith(`${connectionId}:`)) {
        sessionKeysToRemove.push(key);
      }
    }

    for (const key of sessionKeysToRemove) {
      const client = this.sessions.get(key);
      if (client) {
        await client.end().catch(e => console.error(`Error ending session ${key}`, e));
        this.sessions.delete(key);
      }
    }

    console.log(`Closed resources for ID: ${connectionId}`);
  }


  public async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.end().catch(e => console.error('Error closing pool', e));
    }
    this.pools.clear();

    for (const client of this.sessions.values()) {
      await client.end().catch(e => console.error('Error closing session', e));
    }
    this.sessions.clear();
  }

  private getConnectionKey(config: ConnectionConfig): string {
    return `${config.id}:${config.database || 'postgres'}`;
  }

  private async createClientConfig(config: ConnectionConfig): Promise<ClientConfig> {
    // Get password from secret storage if username is provided
    let password: string | undefined;
    if (config.username) {
      password = await SecretStorageService.getInstance().getPassword(config.id);
    }

    // Build SSL configuration
    let sslConfig: boolean | any = false;
    if (config.sslmode && config.sslmode !== 'disable') {
      sslConfig = {
        rejectUnauthorized: config.sslmode === 'verify-ca' || config.sslmode === 'verify-full',
      };

      if (config.sslRootCertPath) {
        try { sslConfig.ca = fs.readFileSync(config.sslRootCertPath).toString(); }
        catch (e) { console.warn('Failed to read SSL CA:', e); }
      }
      if (config.sslCertPath) {
        try { sslConfig.cert = fs.readFileSync(config.sslCertPath).toString(); }
        catch (e) { console.warn('Failed to read SSL Cert:', e); }
      }
      if (config.sslKeyPath) {
        try { sslConfig.key = fs.readFileSync(config.sslKeyPath).toString(); }
        catch (e) { console.warn('Failed to read SSL Key:', e); }
      }
    }

    const clientConfig: ClientConfig = {
      user: config.username || undefined,
      password: password || undefined,
      database: config.database || 'postgres',
      connectionTimeoutMillis: (config.connectTimeout || 5) * 1000,
      statement_timeout: config.statementTimeout || undefined,
      application_name: config.applicationName || 'PgStudio',
      ssl: sslConfig || undefined,
      ...(config.options ? { options: config.options } : {})
    };

    if (config.ssh && config.ssh.enabled) {
      try {
        const stream = await SSHService.getInstance().createStream(
          config.ssh,
          config.host,
          config.port
        );
        clientConfig.stream = stream as any;
      } catch (err: any) {
        throw new Error(`SSH Connection failed: ${err.message}`);
      }
    } else {
      clientConfig.host = config.host;
      clientConfig.port = config.port;
    }

    return clientConfig;
  }
}
