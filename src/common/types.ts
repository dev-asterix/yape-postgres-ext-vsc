export interface ConnectionConfig {
    id: string;
    name?: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
    database?: string;
    ssh?: {
        enabled: boolean;
        host: string;
        port: number;
        username: string;
        privateKeyPath?: string;
    };
}

export interface PostgresMetadata {
    connectionId: string;
    databaseName: string | undefined;
    host: string;
    port: number;
    username?: string;
    password?: string;
    custom?: {
        cells: any[];
        metadata: {
            connectionId: string;
            databaseName: string | undefined;
            host: string;
            port: number;
            username?: string;
            password?: string;
            enableScripts: boolean;
        };
    };
}
