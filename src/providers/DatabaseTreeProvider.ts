import { Client } from 'pg';
import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseTreeItem | undefined | null | void> = new vscode.EventEmitter<DatabaseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private disconnectedConnections: Set<string> = new Set();

    constructor(private readonly extensionContext: vscode.ExtensionContext) {
        // Initialize all connections as disconnected by default
        this.initializeDisconnectedState();
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

    markConnectionConnected(connectionId: string): void {
        this.disconnectedConnections.delete(connectionId);
        // Fire a full refresh to update tree state
        this._onDidChangeTreeData.fire(undefined);
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
                conn.name || `${conn.host}:${conn.port}`,
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

        // Check if connection is disconnected - if so, return empty to prevent expansion
        if (element.connectionId && this.disconnectedConnections.has(element.connectionId)) {
            console.log(`Connection ${element.connectionId} is disconnected, returning empty children`);
            return [];
        }

        const connection = connections.find(c => c.id === element.connectionId);
        if (!connection) {
            console.error(`Connection not found for ID: ${element.connectionId}`);
            vscode.window.showErrorMessage('Connection configuration not found');
            return [];
        }

        let client: Client | undefined;
        try {
            const dbName = element.type === 'connection' ? 'postgres' : element.databaseName;

            console.log(`Attempting to connect to ${connection.name} (${dbName})`);

            // Use ConnectionManager to get a shared connection
            client = await ConnectionManager.getInstance().getConnection({
                id: connection.id,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                database: dbName,
                name: connection.name
            });

            console.log(`Successfully connected to ${connection.name}`);

            // Mark connection as connected when successfully connected (only if not already connected)
            if (element.connectionId && this.disconnectedConnections.has(element.connectionId)) {
                this.markConnectionConnected(element.connectionId);
            }

            switch (element.type) {
                case 'connection':
                    // At connection level, show Databases group and Users & Roles
                    return [
                        new DatabaseTreeItem('Databases', vscode.TreeItemCollapsibleState.Collapsed, 'databases-group', element.connectionId),
                        new DatabaseTreeItem('Users & Roles', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId)
                    ];

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

                    // Schema-level categories
                    switch (element.label) {
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
                            return tableResult.rows.map(row => new DatabaseTreeItem(
                                row.table_name,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                'table',
                                element.connectionId,
                                element.databaseName,
                                element.schema
                            ));

                        case 'Views':
                            const viewResult = await client.query(
                                "SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name",
                                [element.schema]
                            );
                            return viewResult.rows.map(row => new DatabaseTreeItem(
                                row.table_name,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                'view',
                                element.connectionId,
                                element.databaseName,
                                element.schema
                            ));

                        case 'Functions':
                            const functionResult = await client.query(
                                "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION' ORDER BY routine_name",
                                [element.schema]
                            );
                            return functionResult.rows.map(row => new DatabaseTreeItem(
                                row.routine_name,
                                vscode.TreeItemCollapsibleState.None,
                                'function',
                                element.connectionId,
                                element.databaseName,
                                element.schema
                            ));

                        case 'Materialized Views':
                            const materializedViewResult = await client.query(
                                "SELECT matviewname as name FROM pg_matviews WHERE schemaname = $1 ORDER BY matviewname",
                                [element.schema]
                            );
                            return materializedViewResult.rows.map(row => new DatabaseTreeItem(
                                row.name,
                                vscode.TreeItemCollapsibleState.None,
                                'materialized-view',
                                element.connectionId,
                                element.databaseName,
                                element.schema
                            ));

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
                    return [
                        new DatabaseTreeItem('Tables', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                        new DatabaseTreeItem('Views', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                        new DatabaseTreeItem('Functions', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                        new DatabaseTreeItem('Materialized Views', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                        new DatabaseTreeItem('Types', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                        new DatabaseTreeItem('Foreign Tables', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema)
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
            const errorDetails = `Error getting tree items for ${element?.type || 'root'}: [${errorCode}] ${errorMessage}`;

            console.error(errorDetails);
            console.error('Full error:', err);

            // Only show error message to user if it's not a connection initialization issue
            if (element && element.type !== 'connection') {
                vscode.window.showErrorMessage(`Failed to get tree items: ${errorMessage}`);
            }

            return [];
        }
        // Do NOT close the client here, as it is managed by ConnectionManager
    }
}

export class DatabaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'connection' | 'database' | 'schema' | 'table' | 'view' | 'function' | 'column' | 'category' | 'materialized-view' | 'type' | 'foreign-table' | 'extension' | 'role' | 'databases-group' | 'constraint' | 'index' | 'foreign-data-wrapper' | 'foreign-server' | 'user-mapping',
        public readonly connectionId?: string,
        public readonly databaseName?: string,
        public readonly schema?: string,
        public readonly tableName?: string,
        public readonly columnName?: string,
        public readonly comment?: string,
        public readonly isInstalled?: boolean,
        public readonly installedVersion?: string,
        public readonly roleAttributes?: { [key: string]: boolean },
        public readonly isDisconnected?: boolean
    ) {
        super(label, collapsibleState);
        if (type === 'category' && label) {
            // Create specific context value for categories (e.g., category-tables, category-views)
            const suffix = label.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-');
            this.contextValue = `category-${suffix}`;
        } else if (type === 'connection' && isDisconnected) {
            this.contextValue = 'connection-disconnected';
        } else {
            this.contextValue = isInstalled ? `${type}-installed` : type;
        }
        this.tooltip = this.getTooltip(type, comment, roleAttributes);
        this.description = this.getDescription(type, isInstalled, installedVersion, roleAttributes);
        this.iconPath = {
            connection: new vscode.ThemeIcon('plug', isDisconnected ? new vscode.ThemeColor('disabledForeground') : new vscode.ThemeColor('charts.blue')),
            database: new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple')),
            'databases-group': new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple')),
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
            return `${this.label}\n\nAttributes:\n${attributes.join('\n')}`;
        }
        return comment ? `${this.label}\n\n${comment}` : this.label;
    }

    private getDescription(type: string, isInstalled?: boolean, installedVersion?: string, roleAttributes?: { [key: string]: boolean }): string | undefined {
        if (type === 'extension' && isInstalled) {
            return `v${installedVersion} (installed)`;
        }
        if (type === 'role' && roleAttributes) {
            const tags = [];
            if (roleAttributes.rolsuper) tags.push('superuser');
            if (roleAttributes.rolcanlogin) tags.push('login');
            return tags.length > 0 ? `(${tags.join(', ')})` : undefined;
        }
        return undefined;
    }
}
