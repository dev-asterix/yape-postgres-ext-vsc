import { Client } from 'pg';
import { ConnectionConfig } from '../common/types';
import { SecretStorageService } from './SecretStorageService';
import { SSHService } from './SSHService';

export class ConnectionManager {
    private static instance: ConnectionManager;
    private connections: Map<string, Client> = new Map();

    private constructor() { }

    public static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    public async getConnection(config: ConnectionConfig): Promise<Client> {
        const key = this.getConnectionKey(config);

        if (this.connections.has(key)) {
            const client = this.connections.get(key)!;
            // Simple check if connection is still alive (optional, pg client handles some of this)
            // For now, we assume it's good or will throw on query, handling reconnection could be added here
            return client;
        }

        // Get password from secret storage if username is provided
        let password: string | undefined;
        if (config.username) {
            password = await SecretStorageService.getInstance().getPassword(config.id);
            // If username is provided but password is not found in storage, it might still work for some auth methods
        }

        const clientConfig: any = {
            user: config.username || undefined,
            password: password || undefined,
            database: config.database || 'postgres',
            connectionTimeoutMillis: 5000
        };

        if (config.ssh && config.ssh.enabled) {
            try {
                const stream = await SSHService.getInstance().createStream(
                    config.ssh,
                    config.host,
                    config.port
                );
                clientConfig.stream = stream;
            } catch (err: any) {
                throw new Error(`SSH Connection failed: ${err.message}`);
            }
        } else {
            clientConfig.host = config.host;
            clientConfig.port = config.port;
        }

        const client = new Client(clientConfig);

        await client.connect();
        this.connections.set(key, client);

        // Remove connection on error/end
        client.on('end', () => this.connections.delete(key));
        client.on('error', () => this.connections.delete(key));

        return client;
    }

    public async closeConnection(config: ConnectionConfig): Promise<void> {
        const key = this.getConnectionKey(config);
        const client = this.connections.get(key);

        if (client) {
            try {
                await client.end();
                this.connections.delete(key);
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
    }

    public async closeAllConnectionsById(connectionId: string): Promise<void> {
        const keysToClose: string[] = [];

        // Find all connections with this ID
        for (const key of this.connections.keys()) {
            if (key.startsWith(`${connectionId}:`)) {
                keysToClose.push(key);
            }
        }

        // Close all found connections
        for (const key of keysToClose) {
            const client = this.connections.get(key);
            if (client) {
                try {
                    await client.end();
                    this.connections.delete(key);
                } catch (e) {
                    console.error(`Error closing connection ${key}:`, e);
                }
            }
        }

        console.log(`Closed ${keysToClose.length} connections for ID: ${connectionId}`);
    }

    public async closeAll(): Promise<void> {
        for (const client of this.connections.values()) {
            try {
                await client.end();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        this.connections.clear();
    }

    private getConnectionKey(config: ConnectionConfig): string {
        // Unique key for connection: ID + Database
        // If database is not specified, it connects to default (usually postgres)
        return `${config.id}:${config.database || 'postgres'}`;
    }
}
