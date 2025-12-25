import { Client, PoolClient } from 'pg';
import * as vscode from 'vscode';
import * as path from 'path';
import { ConnectionManager } from '../services/ConnectionManager';

// Key format for favorites: "type:connectionId:database:schema:name"
function buildItemKey(item: DatabaseTreeItem): string {
  const parts = [item.type, item.connectionId || '', item.databaseName || '', item.schema || '', item.label];
  return parts.join(':');
}

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DatabaseTreeItem | undefined | null | void> = new vscode.EventEmitter<DatabaseTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DatabaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private disconnectedConnections: Set<string> = new Set();

  // Filter, Favorites, and Recent Items
  private _filterPattern: string = '';
  private _favorites: Set<string> = new Set();
  private _recentItems: string[] = [];
  private static readonly MAX_RECENT_ITEMS = 10;
  private static readonly FAVORITES_KEY = 'postgresExplorer.favorites';
  private static readonly RECENT_KEY = 'postgresExplorer.recentItems';

  constructor(private readonly extensionContext: vscode.ExtensionContext) {
    // Initialize all connections as disconnected by default
    this.initializeDisconnectedState();
    // Load persisted favorites and recent items
    this.loadPersistedData();
  }

  private loadPersistedData(): void {
    const favorites = this.extensionContext.globalState.get<string[]>(DatabaseTreeProvider.FAVORITES_KEY, []);
    this._favorites = new Set(favorites);
    this._recentItems = this.extensionContext.globalState.get<string[]>(DatabaseTreeProvider.RECENT_KEY, []);
  }

  private async saveFavorites(): Promise<void> {
    await this.extensionContext.globalState.update(DatabaseTreeProvider.FAVORITES_KEY, Array.from(this._favorites));
  }

  private async saveRecentItems(): Promise<void> {
    await this.extensionContext.globalState.update(DatabaseTreeProvider.RECENT_KEY, this._recentItems);
  }

  // Filter methods
  get filterPattern(): string {
    return this._filterPattern;
  }

  setFilter(pattern: string): void {
    this._filterPattern = pattern.toLowerCase();
    this.refresh();
  }

  clearFilter(): void {
    this._filterPattern = '';
    this.refresh();
  }

  // Favorites methods
  isFavorite(item: DatabaseTreeItem): boolean {
    return this._favorites.has(buildItemKey(item));
  }

  async addToFavorites(item: DatabaseTreeItem): Promise<void> {
    const key = buildItemKey(item);
    this._favorites.add(key);
    await this.saveFavorites();
    this.refresh();
    vscode.window.showInformationMessage(`Added "${item.label}" to favorites`);
  }

  async removeFromFavorites(item: DatabaseTreeItem): Promise<void> {
    const key = buildItemKey(item);
    this._favorites.delete(key);
    await this.saveFavorites();
    this.refresh();
    vscode.window.showInformationMessage(`Removed "${item.label}" from favorites`);
  }

  getFavoriteKeys(): string[] {
    return Array.from(this._favorites);
  }

  // Recent items methods
  async addToRecent(item: DatabaseTreeItem): Promise<void> {
    const key = buildItemKey(item);
    // Remove if already exists (to move to front)
    this._recentItems = this._recentItems.filter(k => k !== key);
    // Add to front
    this._recentItems.unshift(key);
    // Trim to max size
    if (this._recentItems.length > DatabaseTreeProvider.MAX_RECENT_ITEMS) {
      this._recentItems = this._recentItems.slice(0, DatabaseTreeProvider.MAX_RECENT_ITEMS);
    }
    await this.saveRecentItems();
  }

  getRecentKeys(): string[] {
    return [...this._recentItems];
  }

  private matchesFilter(label: string): boolean {
    if (!this._filterPattern) return true;
    return label.toLowerCase().includes(this._filterPattern);
  }

  private isFavoriteItem(type: string, connectionId?: string, databaseName?: string, schema?: string, name?: string): boolean {
    const key = `${type}:${connectionId || ''}:${databaseName || ''}:${schema || ''}:${name || ''} `;
    return this._favorites.has(key);
  }

  private initializeDisconnectedState(): void {
    const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
    connections.forEach(conn => {
      this.disconnectedConnections.add(conn.id);
    });
  }

  markConnectionDisconnected(connectionId: string): void {
    this.disconnectedConnections.add(connectionId);
    // Fire a full refresh to update tree state and collapse items
    this._onDidChangeTreeData.fire(undefined);
  }

  public markConnectionConnected(connectionId: string): void {
    this.disconnectedConnections.delete(connectionId);
    // Fire a full refresh to update tree state
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get database objects (tables, views, functions) for a connection
   * Used by AI Generate Query feature to provide schema context
   */
  public async getDbObjectsForConnection(connection: any): Promise<Array<{ type: string, schema: string, name: string, columns?: string[] }>> {
    const client = await ConnectionManager.getInstance().getPooledClient({
      id: connection.id,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      database: connection.database,
      name: connection.name
    });

    try {
      const objects: Array<{ type: string, schema: string, name: string, columns?: string[] }> = [];

      // Fetch tables with columns
      const tablesQuery = `
        SELECT 
          t.table_schema,
          t.table_name,
          array_agg(c.column_name ORDER BY c.ordinal_position) as columns
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c 
          ON t.table_schema = c.table_schema 
          AND t.table_name = c.table_name
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
          AND t.table_type = 'BASE TABLE'
        GROUP BY t.table_schema, t.table_name
        ORDER BY t.table_schema, t.table_name
        LIMIT 100
      `;

      const tablesResult = await client.query(tablesQuery);
      tablesResult.rows.forEach((row: any) => {
        objects.push({
          type: 'table',
          schema: row.table_schema,
          name: row.table_name,
          columns: row.columns
        });
      });

      // Fetch views with columns
      const viewsQuery = `
        SELECT 
          t.table_schema,
          t.table_name,
          array_agg(c.column_name ORDER BY c.ordinal_position) as columns
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c 
          ON t.table_schema = c.table_schema 
          AND t.table_name = c.table_name
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
          AND t.table_type = 'VIEW'
        GROUP BY t.table_schema, t.table_name
        ORDER BY t.table_schema, t.table_name
        LIMIT 50
      `;

      const viewsResult = await client.query(viewsQuery);
      viewsResult.rows.forEach((row: any) => {
        objects.push({
          type: 'view',
          schema: row.table_schema,
          name: row.table_name,
          columns: row.columns
        });
      });

      // Fetch functions
      const functionsQuery = `
        SELECT 
          n.nspname as schema_name,
          p.proname as function_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY n.nspname, p.proname
        LIMIT 50
      `;

      const functionsResult = await client.query(functionsQuery);
      functionsResult.rows.forEach((row: any) => {
        objects.push({
          type: 'function',
          schema: row.schema_name,
          name: row.function_name
        });
      });

      return objects;
    } finally {
      client.release();
    }
  }

  refresh(element?: DatabaseTreeItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  collapseAll(): void {
    // This will trigger a refresh of the tree view with all items collapsed
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];

    if (!element) {
      // Root level - show connections
      return connections.map(conn => new DatabaseTreeItem(
        conn.name || `${conn.host}:${conn.port} `,
        vscode.TreeItemCollapsibleState.Collapsed,
        'connection',
        conn.id,
        undefined, // databaseName
        undefined, // schema
        undefined, // tableName
        undefined, // columnName
        undefined, // comment
        undefined, // isInstalled
        undefined, // installedVersion
        undefined, // roleAttributes
        this.disconnectedConnections.has(conn.id) // isDisconnected
      ));
    }

    // Auto-connect on expansion: if connection is disconnected, mark it as connected
    if (element.type === 'connection' && element.connectionId && this.disconnectedConnections.has(element.connectionId)) {
      console.log(`Connection ${element.connectionId} is being expanded, auto - connecting...`);
      this.markConnectionConnected(element.connectionId);
    }

    const connection = connections.find(c => c.id === element.connectionId);
    if (!connection) {
      console.error(`Connection not found for ID: ${element.connectionId} `);
      vscode.window.showErrorMessage('Connection configuration not found');
      return [];
    }

    let client: PoolClient | undefined;
    try {
      const dbName = element.type === 'connection' ? 'postgres' : element.databaseName;

      console.log(`Attempting to connect to ${connection.name} (${dbName})`);

      // Use ConnectionManager to get a shared pooled client
      // We must cast to any to handle the _originalEnd logic if we were using getConnection, 
      // but here we switch to getPooledClient and will call release() explicitly or let the helper handle it.
      // However, getChildren seems to assume it can hold onto 'client'?
      // Wait, getChildren logic is: get client, run query, return items. It doesn't seem to pass client to items.
      // So we should acquire, query, release.

      client = await ConnectionManager.getInstance().getPooledClient({
        id: connection.id,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        database: dbName,
        name: connection.name
      });

      console.log(`Successfully connected to ${connection.name} `);

      switch (element.type) {
        case 'connection':
          // At connection level, show Favorites (if any), Databases group and Users & Roles
          const items: DatabaseTreeItem[] = [];

          // Check if there are favorites for this connection
          const connectionFavorites = this.getFavoriteKeys().filter(key => {
            const parts = key.split(':');
            return parts[1] === element.connectionId;
          });
          if (connectionFavorites.length > 0) {
            items.push(new DatabaseTreeItem('Favorites', vscode.TreeItemCollapsibleState.Collapsed, 'favorites-group', element.connectionId));
          }

          // Check if there are recent items for this connection
          const connectionRecent = this.getRecentKeys().filter(key => {
            const parts = key.split(':');
            return parts[1] === element.connectionId;
          });
          if (connectionRecent.length > 0) {
            items.push(new DatabaseTreeItem('Recent', vscode.TreeItemCollapsibleState.Collapsed, 'recent-group', element.connectionId));
          }

          items.push(new DatabaseTreeItem('Databases', vscode.TreeItemCollapsibleState.Collapsed, 'databases-group', element.connectionId));
          items.push(new DatabaseTreeItem('Users & Roles', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId));
          return items;

        case 'databases-group':
          // Show all databases under the Databases group (including system databases)
          const dbResult = await client.query(
            "SELECT datname FROM pg_database ORDER BY datname"
          );
          return dbResult.rows.map(row => new DatabaseTreeItem(
            row.datname,
            vscode.TreeItemCollapsibleState.Collapsed,
            'database',
            element.connectionId,
            row.datname
          ));

        case 'favorites-group':
          // Show all favorited items for this connection
          const favoriteItems: DatabaseTreeItem[] = [];
          const favoriteKeys = this.getFavoriteKeys().filter(key => {
            const parts = key.split(':');
            return parts[1] === element.connectionId;
          });

          for (const key of favoriteKeys) {
            const parts = key.split(':');
            // Key format: type:connectionId:database:schema:name
            const itemType = parts[0] as 'table' | 'view' | 'function' | 'materialized-view';
            const dbName = parts[2];
            const schemaName = parts[3];
            const itemName = parts[4];

            // Determine collapsible state based on type
            const collapsible = (itemType === 'table' || itemType === 'view')
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None;

            // Use just the item name as label (for SQL commands), put extra info in description via isFavorite handling
            favoriteItems.push(new DatabaseTreeItem(
              itemName,    // Just the name - SQL commands use label
              collapsible,
              itemType,
              element.connectionId,
              dbName,
              schemaName,
              itemName,    // tableName - also just the name
              undefined,   // columnName
              `${schemaName}.${dbName} `, // comment - for tooltip
              undefined,   // isInstalled
              undefined,   // installedVersion
              undefined,   // roleAttributes
              undefined,   // isDisconnected
              true         // isFavorite
            ));
          }
          return favoriteItems;

        case 'recent-group':
          // Show all recent items for this connection (max 10)
          const recentItems: DatabaseTreeItem[] = [];
          const recentKeys = this.getRecentKeys().filter(key => {
            const parts = key.split(':');
            return parts[1] === element.connectionId;
          });

          for (const key of recentKeys) {
            const parts = key.split(':');
            // Key format: type:connectionId:database:schema:name
            const itemType = parts[0] as 'table' | 'view' | 'function' | 'materialized-view';
            const dbName = parts[2];
            const schemaName = parts[3];
            const itemName = parts[4];

            // Determine collapsible state based on type
            const collapsible = (itemType === 'table' || itemType === 'view')
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None;

            // Use just the item name as label
            recentItems.push(new DatabaseTreeItem(
              itemName,
              collapsible,
              itemType,
              element.connectionId,
              dbName,
              schemaName,
              itemName,
              undefined,   // columnName
              `${schemaName}.${dbName} `, // comment - for tooltip
              undefined,   // isInstalled
              undefined,   // installedVersion
              undefined,   // roleAttributes
              undefined,   // isDisconnected
              false        // isFavorite - these are recent, not favorites
            ));
          }
          return recentItems;

        case 'database':
          // Return just the categories at database level
          return [
            new DatabaseTreeItem('Schemas', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName),
            new DatabaseTreeItem('Extensions', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName),
            new DatabaseTreeItem('Foreign Data Wrappers', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName)
          ];

        case 'category':
          // Handle table sub-categories
          if (element.tableName) {
            switch (element.label) {
              case 'Columns':
                const columnResult = await client.query(
                  "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
                  [element.schema, element.tableName]
                );
                return columnResult.rows.map(row => new DatabaseTreeItem(
                  `${row.column_name} (${row.data_type})`,
                  vscode.TreeItemCollapsibleState.None,
                  'column',
                  element.connectionId,
                  element.databaseName,
                  element.schema,
                  element.tableName,
                  row.column_name
                ));

              case 'Constraints':
                const constraintResult = await client.query(
                  `SELECT
tc.constraint_name,
  tc.constraint_type
                                    FROM information_schema.table_constraints tc
                                    WHERE tc.table_schema = $1 AND tc.table_name = $2
                                    ORDER BY tc.constraint_type, tc.constraint_name`,
                  [element.schema, element.tableName]
                );
                return constraintResult.rows.map(row => {
                  return new DatabaseTreeItem(
                    row.constraint_name,
                    vscode.TreeItemCollapsibleState.None,
                    'constraint',
                    element.connectionId,
                    element.databaseName,
                    element.schema,
                    element.tableName
                  );
                });

              case 'Indexes':
                const indexResult = await client.query(
                  `SELECT
i.relname as index_name,
  ix.indisunique as is_unique,
  ix.indisprimary as is_primary
                                    FROM pg_index ix
                                    JOIN pg_class i ON i.oid = ix.indexrelid
                                    JOIN pg_class t ON t.oid = ix.indrelid
                                    JOIN pg_namespace n ON n.oid = t.relnamespace
                                    WHERE n.nspname = $1 AND t.relname = $2
                                    ORDER BY i.relname`,
                  [element.schema, element.tableName]
                );
                return indexResult.rows.map(row => {
                  return new DatabaseTreeItem(
                    row.index_name,
                    vscode.TreeItemCollapsibleState.None,
                    'index',
                    element.connectionId,
                    element.databaseName,
                    element.schema,
                    element.tableName
                  );
                });
            }
          }

          // Schema-level categories - extract base name (handle badge format "Tables • 5")
          const categoryName = element.label.split(' • ')[0];
          switch (categoryName) {
            case 'Users & Roles':
              const roleResult = await client.query(
                `SELECT r.rolname,
  r.rolsuper,
  r.rolcreatedb,
  r.rolcreaterole,
  r.rolcanlogin
                                 FROM pg_roles r
                                 ORDER BY r.rolname`
              );
              return roleResult.rows.map(row => new DatabaseTreeItem(
                row.rolname,
                vscode.TreeItemCollapsibleState.None,
                'role',
                element.connectionId,
                element.databaseName,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                  rolsuper: row.rolsuper,
                  rolcreatedb: row.rolcreatedb,
                  rolcreaterole: row.rolcreaterole,
                  rolcanlogin: row.rolcanlogin
                }
              ));

            case 'Schemas':
              const schemaResult = await client.query(
                `SELECT nspname as schema_name 
                                 FROM pg_namespace 
                                 WHERE nspname NOT LIKE 'pg_%' 
                                   AND nspname != 'information_schema'
                                 ORDER BY
CASE 
                                        WHEN nspname = 'public' THEN 0
                                        ELSE 1
END,
  nspname`
              );

              // If filter is active, only show schemas that have matching items
              if (this._filterPattern) {
                const filteredSchemas: DatabaseTreeItem[] = [];
                for (const row of schemaResult.rows) {
                  // Check if schema has any matching tables, views, or functions
                  const matchResult = await client.query(
                    `SELECT 1 FROM information_schema.tables 
                     WHERE table_schema = $1 AND table_type = 'BASE TABLE' 
                       AND LOWER(table_name) LIKE $2
                     UNION ALL
                     SELECT 1 FROM information_schema.views 
                     WHERE table_schema = $1 AND LOWER(table_name) LIKE $2
                     UNION ALL
                     SELECT 1 FROM information_schema.routines 
                     WHERE routine_schema = $1 AND routine_type = 'FUNCTION' 
                       AND LOWER(routine_name) LIKE $2
                     LIMIT 1`,
                    [row.schema_name, `% ${this._filterPattern}% `]
                  );
                  if (matchResult.rows.length > 0) {
                    filteredSchemas.push(new DatabaseTreeItem(
                      row.schema_name,
                      vscode.TreeItemCollapsibleState.Collapsed,
                      'schema',
                      element.connectionId,
                      element.databaseName,
                      row.schema_name
                    ));
                  }
                }
                return filteredSchemas;
              }

              return schemaResult.rows.map(row => new DatabaseTreeItem(
                row.schema_name,
                vscode.TreeItemCollapsibleState.Collapsed,
                'schema',
                element.connectionId,
                element.databaseName,
                row.schema_name
              ));

            case 'Extensions':
              const extensionResult = await client.query(
                `SELECT e.name,
  e.installed_version,
  e.default_version,
  e.comment,
  CASE WHEN e.installed_version IS NOT NULL THEN true ELSE false END as is_installed
                                 FROM pg_available_extensions e
                                 ORDER BY is_installed DESC, name`
              );
              return extensionResult.rows.map(row => new DatabaseTreeItem(
                row.installed_version ? `${row.name} (${row.installed_version})` : `${row.name} (${row.default_version})`,
                vscode.TreeItemCollapsibleState.None,
                'extension',
                element.connectionId,
                element.databaseName,
                undefined,
                undefined,
                undefined,
                row.comment,
                row.is_installed,
                row.installed_version
              ));

            // Existing category cases for schema level items
            case 'Tables':
              const tableResult = await client.query(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
                [element.schema]
              );
              return tableResult.rows
                .filter(row => this.matchesFilter(row.table_name))
                .map(row => {
                  const isFav = this.isFavoriteItem('table', element.connectionId, element.databaseName, element.schema, row.table_name);
                  return new DatabaseTreeItem(
                    row.table_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'table',
                    element.connectionId,
                    element.databaseName,
                    element.schema,
                    undefined, // tableName
                    undefined, // columnName
                    undefined, // comment
                    undefined, // isInstalled
                    undefined, // installedVersion
                    undefined, // roleAttributes
                    undefined, // isDisconnected
                    isFav      // isFavorite
                  );
                });

            case 'Views':
              const viewResult = await client.query(
                "SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name",
                [element.schema]
              );
              return viewResult.rows
                .filter(row => this.matchesFilter(row.table_name))
                .map(row => {
                  const isFav = this.isFavoriteItem('view', element.connectionId, element.databaseName, element.schema, row.table_name);
                  return new DatabaseTreeItem(
                    row.table_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'view',
                    element.connectionId,
                    element.databaseName,
                    element.schema,
                    undefined, undefined, undefined, undefined, undefined, undefined, undefined,
                    isFav
                  );
                });

            case 'Functions':
              const functionResult = await client.query(
                "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION' ORDER BY routine_name",
                [element.schema]
              );
              return functionResult.rows
                .filter(row => this.matchesFilter(row.routine_name))
                .map(row => {
                  const isFav = this.isFavoriteItem('function', element.connectionId, element.databaseName, element.schema, row.routine_name);
                  return new DatabaseTreeItem(
                    row.routine_name,
                    vscode.TreeItemCollapsibleState.None,
                    'function',
                    element.connectionId,
                    element.databaseName,
                    element.schema,
                    undefined, undefined, undefined, undefined, undefined, undefined, undefined,
                    isFav
                  );
                });

            case 'Materialized Views':
              const materializedViewResult = await client.query(
                "SELECT matviewname as name FROM pg_matviews WHERE schemaname = $1 ORDER BY matviewname",
                [element.schema]
              );
              return materializedViewResult.rows
                .filter(row => this.matchesFilter(row.name))
                .map(row => {
                  const isFav = this.isFavoriteItem('materialized-view', element.connectionId, element.databaseName, element.schema, row.name);
                  return new DatabaseTreeItem(
                    row.name,
                    vscode.TreeItemCollapsibleState.None,
                    'materialized-view',
                    element.connectionId,
                    element.databaseName,
                    element.schema,
                    undefined, undefined, undefined, undefined, undefined, undefined, undefined,
                    isFav
                  );
                });

            case 'Types':
              const typeResult = await client.query(
                `SELECT t.typname as name
                                 FROM pg_type t
                                 JOIN pg_namespace n ON t.typnamespace = n.oid
                                 WHERE n.nspname = $1
                                 AND t.typtype = 'c'
                                 ORDER BY t.typname`,
                [element.schema]
              );
              return typeResult.rows.map(row => new DatabaseTreeItem(
                row.name,
                vscode.TreeItemCollapsibleState.None,
                'type',
                element.connectionId,
                element.databaseName,
                element.schema
              ));

            case 'Foreign Tables':
              const foreignTableResult = await client.query(
                `SELECT c.relname as name
                                 FROM pg_foreign_table ft
                                 JOIN pg_class c ON ft.ftrelid = c.oid
                                 JOIN pg_namespace n ON c.relnamespace = n.oid
                                 WHERE n.nspname = $1
                                 ORDER BY c.relname`,
                [element.schema]
              );
              return foreignTableResult.rows.map(row => new DatabaseTreeItem(
                row.name,
                vscode.TreeItemCollapsibleState.None,
                'foreign-table',
                element.connectionId,
                element.databaseName,
                element.schema
              ));

            case 'Foreign Data Wrappers':
              const fdwResult = await client.query(
                `SELECT fdwname as name
                                 FROM pg_foreign_data_wrapper
                                 ORDER BY fdwname`
              );
              return fdwResult.rows.map(row => new DatabaseTreeItem(
                row.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                'foreign-data-wrapper',
                element.connectionId,
                element.databaseName
              ));
          }
          return [];

        case 'schema':
          // Query counts for each category (with filter applied if active)
          const filterPattern = this._filterPattern ? `% ${this._filterPattern.toLowerCase()}% ` : null;

          const tablesCountResult = await client.query(
            filterPattern
              ? "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND LOWER(table_name) LIKE $2"
              : "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
            filterPattern ? [element.schema, filterPattern] : [element.schema]
          );

          const viewsCountResult = await client.query(
            filterPattern
              ? "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = $1 AND LOWER(table_name) LIKE $2"
              : "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = $1",
            filterPattern ? [element.schema, filterPattern] : [element.schema]
          );

          const functionsCountResult = await client.query(
            filterPattern
              ? "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION' AND LOWER(routine_name) LIKE $2"
              : "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION'",
            filterPattern ? [element.schema, filterPattern] : [element.schema]
          );

          const materializedViewsCountResult = await client.query(
            filterPattern
              ? "SELECT COUNT(*) FROM pg_matviews WHERE schemaname = $1 AND LOWER(matviewname) LIKE $2"
              : "SELECT COUNT(*) FROM pg_matviews WHERE schemaname = $1",
            filterPattern ? [element.schema, filterPattern] : [element.schema]
          );

          const typesCountResult = await client.query(
            "SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = $1 AND t.typtype = 'c'",
            [element.schema]
          );

          const foreignTablesCountResult = await client.query(
            "SELECT COUNT(*) FROM information_schema.foreign_tables WHERE foreign_table_schema = $1",
            [element.schema]
          );

          return [
            new DatabaseTreeItem(`Tables • ${tablesCountResult.rows[0].count} `, vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
            new DatabaseTreeItem(`Views • ${viewsCountResult.rows[0].count} `, vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
            new DatabaseTreeItem(`Functions • ${functionsCountResult.rows[0].count} `, vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
            new DatabaseTreeItem(`Materialized Views • ${materializedViewsCountResult.rows[0].count} `, vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
            new DatabaseTreeItem(`Types • ${typesCountResult.rows[0].count} `, vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
            new DatabaseTreeItem(`Foreign Tables • ${foreignTablesCountResult.rows[0].count} `, vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema)
          ];

        case 'table':
          // Show hierarchical structure for tables
          return [
            new DatabaseTreeItem('Columns', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema, element.label),
            new DatabaseTreeItem('Constraints', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema, element.label),
            new DatabaseTreeItem('Indexes', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema, element.label)
          ];

        case 'view':
          // Views only have columns
          return [
            new DatabaseTreeItem('Columns', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema, element.label)
          ];

        case 'foreign-data-wrapper':
          // FDW node - list all foreign servers using this FDW
          const serversResult = await client.query(
            `SELECT srv.srvname as name
                         FROM pg_foreign_server srv
                         JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
                         WHERE fdw.fdwname = $1
                         ORDER BY srv.srvname`,
            [element.label]
          );
          return serversResult.rows.map(row => new DatabaseTreeItem(
            row.name,
            vscode.TreeItemCollapsibleState.Collapsed,
            'foreign-server',
            element.connectionId,
            element.databaseName,
            element.label // Store FDW name in schema field
          ));

        case 'foreign-server':
          // Foreign server node - list all user mappings
          const mappingsResult = await client.query(
            `SELECT um.usename as name
                         FROM pg_user_mappings um
                         WHERE um.srvname = $1
                         ORDER BY um.usename`,
            [element.label]
          );
          return mappingsResult.rows.map(row => new DatabaseTreeItem(
            row.name,
            vscode.TreeItemCollapsibleState.None,
            'user-mapping',
            element.connectionId,
            element.databaseName,
            element.label, // Store server name in schema field
            element.label  // Store server name in tableName for context
          ));

        default:
          return [];
      }
    } catch (err: any) {
      const errorMessage = err.message || err.toString() || 'Unknown error';
      const errorCode = err.code || 'NO_CODE';
      const errorDetails = `Error getting tree items for ${element?.type || 'root'}: [${errorCode}] ${errorMessage} `;

      console.error(errorDetails);
      console.error('Full error:', err);

      // Only show error message to user if it's not a connection initialization issue
      if (element && element.type !== 'connection') {
        vscode.window.showErrorMessage(`Failed to get tree items: ${errorMessage} `);
      }

      return [];
    } finally {
      // Release the pooled client
      if (client) {
        try {
          client.release();
        } catch (e) { console.error('Error releasing client', e); }
      }
    }
    // Do NOT close the client here, as it is managed by ConnectionManager
  }
}

export class DatabaseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'connection' | 'database' | 'schema' | 'table' | 'view' | 'function' | 'column' | 'category' | 'materialized-view' | 'type' | 'foreign-table' | 'extension' | 'role' | 'databases-group' | 'favorites-group' | 'recent-group' | 'constraint' | 'index' | 'foreign-data-wrapper' | 'foreign-server' | 'user-mapping',
    public readonly connectionId?: string,
    public readonly databaseName?: string,
    public readonly schema?: string,
    public readonly tableName?: string,
    public readonly columnName?: string,
    public readonly comment?: string,
    public readonly isInstalled?: boolean,
    public readonly installedVersion?: string,
    public readonly roleAttributes?: { [key: string]: boolean },
    public readonly isDisconnected?: boolean,
    public readonly isFavorite?: boolean,
    public readonly count?: number  // For category item counts
  ) {
    super(label, collapsibleState);
    if (type === 'category' && label) {
      // Create specific context value for categories (e.g., category-tables, category-views)
      const suffix = label.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-');
      this.contextValue = `category - ${suffix} `;
    } else if (type === 'connection' && isDisconnected) {
      this.contextValue = 'connection-disconnected';
    } else {
      // Keep original contextValue - isFavorite flag is stored separately for star indicator
      // For favorites menu detection, we use description containing ★
      this.contextValue = isInstalled ? `${type} -installed` : type;
    }
    this.tooltip = this.getTooltip(type, comment, roleAttributes);
    this.description = this.getDescription(type, isInstalled, installedVersion, roleAttributes, isFavorite, count);
    this.iconPath = {
      connection: new vscode.ThemeIcon('plug', isDisconnected ? new vscode.ThemeColor('disabledForeground') : new vscode.ThemeColor('charts.blue')),
      database: new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple')),
      'databases-group': new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple')),
      'favorites-group': new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow')),
      'recent-group': new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.green')),
      schema: new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('charts.yellow')),
      table: new vscode.ThemeIcon('table', new vscode.ThemeColor('charts.blue')),
      view: new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.green')),
      function: new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.orange')),
      column: new vscode.ThemeIcon('symbol-field', new vscode.ThemeColor('charts.blue')),
      category: new vscode.ThemeIcon('list-tree'),
      'materialized-view': new vscode.ThemeIcon('symbol-structure', new vscode.ThemeColor('charts.green')),
      type: new vscode.ThemeIcon('symbol-type-parameter', new vscode.ThemeColor('charts.red')),
      'foreign-table': new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('charts.blue')),
      extension: new vscode.ThemeIcon(isInstalled ? 'extensions-installed' : 'extensions', isInstalled ? new vscode.ThemeColor('charts.green') : undefined),
      role: new vscode.ThemeIcon('person', new vscode.ThemeColor('charts.yellow')),
      constraint: new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.orange')),
      index: new vscode.ThemeIcon('search', new vscode.ThemeColor('charts.purple')),
      'foreign-data-wrapper': new vscode.ThemeIcon('extensions', new vscode.ThemeColor('charts.blue')),
      'foreign-server': new vscode.ThemeIcon('server', new vscode.ThemeColor('charts.green')),
      'user-mapping': new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.yellow'))
    }[type];
  }

  private getTooltip(type: string, comment?: string, roleAttributes?: { [key: string]: boolean }): string {
    if (type === 'role' && roleAttributes) {
      const attributes = [];
      if (roleAttributes.rolsuper) attributes.push('Superuser');
      if (roleAttributes.rolcreatedb) attributes.push('Create DB');
      if (roleAttributes.rolcreaterole) attributes.push('Create Role');
      if (roleAttributes.rolcanlogin) attributes.push('Can Login');
      return `${this.label} \n\nAttributes: \n${attributes.join('\n')} `;
    }
    return comment ? `${this.label} \n\n${comment} ` : this.label;
  }

  private getDescription(type: string, isInstalled?: boolean, installedVersion?: string, roleAttributes?: { [key: string]: boolean }, isFavorite?: boolean, count?: number): string | undefined {
    let desc: string | undefined = undefined;

    if (type === 'extension' && isInstalled) {
      desc = `v${installedVersion} (installed)`;
    } else if (type === 'role' && roleAttributes) {
      const tags = [];
      if (roleAttributes.rolsuper) tags.push('superuser');
      if (roleAttributes.rolcanlogin) tags.push('login');
      desc = tags.length > 0 ? `(${tags.join(', ')})` : undefined;
    }

    // Append muted star for favorites (★ is more subtle than ⭐)
    if (isFavorite) {
      return desc ? `${desc} ★` : '★';
    }
    return desc;
  }
}
