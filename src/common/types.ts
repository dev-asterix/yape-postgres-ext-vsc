export interface ConnectionConfig {
  id: string;
  name?: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  // Advanced connection options
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  sslCertPath?: string;       // Client certificate path
  sslKeyPath?: string;        // Client key path
  sslRootCertPath?: string;   // CA certificate path
  statementTimeout?: number;  // milliseconds
  connectTimeout?: number;    // seconds (default: 5)
  applicationName?: string;   // Shows in pg_stat_activity
  options?: string;           // Raw options string (e.g., "-c search_path=myschema")
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
