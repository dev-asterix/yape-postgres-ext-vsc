/**
 * Database object fetching service for @ mentions
 */
import * as vscode from 'vscode';
import { Client } from 'pg';
import { ConnectionManager } from '../../services/ConnectionManager';
import { DbObject } from './types';

export class DbObjectService {
    private _cache: DbObject[] = [];

    async fetchDbObjects(): Promise<DbObject[]> {
        const objects: DbObject[] = [];
        const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];

        console.log('[ChatView] Fetching DB objects, connections found:', connections.length);

        if (connections.length === 0) {
            console.log('[ChatView] No connections configured');
            return objects;
        }

        for (const conn of connections) {
            try {
                const connName = conn.name || conn.host;
                console.log('[ChatView] Processing connection:', connName);

                const client = await ConnectionManager.getInstance().getConnection({
                    id: conn.id,
                    host: conn.host,
                    port: conn.port,
                    username: conn.username,
                    database: 'postgres',
                    name: conn.name
                });

                const dbResult = await client.query(
                    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
                );

                console.log('[ChatView] Found databases:', dbResult.rows.length);

                for (const dbRow of dbResult.rows) {
                    const dbName = dbRow.datname;
                    
                    try {
                        const dbClient = await ConnectionManager.getInstance().getConnection({
                            id: conn.id,
                            host: conn.host,
                            port: conn.port,
                            username: conn.username,
                            database: dbName,
                            name: conn.name
                        });

                        const schemaResult = await dbClient.query(
                            "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'"
                        );

                        for (const schemaRow of schemaResult.rows) {
                            const schemaName = schemaRow.nspname;

                            objects.push({
                                name: schemaName,
                                type: 'schema',
                                schema: schemaName,
                                database: dbName,
                                connectionId: conn.id,
                                connectionName: connName,
                                breadcrumb: `${connName} > ${dbName} > ${schemaName}`
                            });

                            // Get tables
                            const tableResult = await dbClient.query(
                                "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
                                [schemaName]
                            );
                            for (const row of tableResult.rows) {
                                objects.push({
                                    name: row.table_name,
                                    type: 'table',
                                    schema: schemaName,
                                    database: dbName,
                                    connectionId: conn.id,
                                    connectionName: connName,
                                    breadcrumb: `${connName} > ${dbName} > ${schemaName} > ${row.table_name}`
                                });
                            }

                            // Get views
                            const viewResult = await dbClient.query(
                                "SELECT table_name FROM information_schema.views WHERE table_schema = $1",
                                [schemaName]
                            );
                            for (const row of viewResult.rows) {
                                objects.push({
                                    name: row.table_name,
                                    type: 'view',
                                    schema: schemaName,
                                    database: dbName,
                                    connectionId: conn.id,
                                    connectionName: connName,
                                    breadcrumb: `${connName} > ${dbName} > ${schemaName} > ${row.table_name}`
                                });
                            }

                            // Get functions
                            const funcResult = await dbClient.query(
                                "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION'",
                                [schemaName]
                            );
                            for (const row of funcResult.rows) {
                                objects.push({
                                    name: row.routine_name,
                                    type: 'function',
                                    schema: schemaName,
                                    database: dbName,
                                    connectionId: conn.id,
                                    connectionName: connName,
                                    breadcrumb: `${connName} > ${dbName} > ${schemaName} > ${row.routine_name}`
                                });
                            }

                            // Get materialized views
                            const matViewResult = await dbClient.query(
                                "SELECT matviewname FROM pg_matviews WHERE schemaname = $1",
                                [schemaName]
                            );
                            for (const row of matViewResult.rows) {
                                objects.push({
                                    name: row.matviewname,
                                    type: 'materialized-view',
                                    schema: schemaName,
                                    database: dbName,
                                    connectionId: conn.id,
                                    connectionName: connName,
                                    breadcrumb: `${connName} > ${dbName} > ${schemaName} > ${row.matviewname}`
                                });
                            }

                            // Get types
                            const typeResult = await dbClient.query(
                                "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = $1 AND t.typtype = 'c'",
                                [schemaName]
                            );
                            for (const row of typeResult.rows) {
                                objects.push({
                                    name: row.typname,
                                    type: 'type',
                                    schema: schemaName,
                                    database: dbName,
                                    connectionId: conn.id,
                                    connectionName: connName,
                                    breadcrumb: `${connName} > ${dbName} > ${schemaName} > ${row.typname}`
                                });
                            }
                        }
                    } catch (e) {
                        console.error('[ChatView] Error fetching from database ' + dbName + ':', e);
                    }
                }
            } catch (e) {
                console.error('[ChatView] Error fetching from connection ' + conn.name + ':', e);
            }
        }

        console.log('[ChatView] Total objects found:', objects.length);
        this._cache = objects;
        return objects;
    }

    async getObjectSchema(obj: DbObject): Promise<string> {
        const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
        const conn = connections.find(c => c.id === obj.connectionId);
        if (!conn) { return 'Connection not found'; }

        try {
            const client = await ConnectionManager.getInstance().getConnection({
                id: conn.id,
                host: conn.host,
                port: conn.port,
                username: conn.username,
                database: obj.database,
                name: conn.name
            });

            switch (obj.type) {
                case 'table':
                    return await this._getTableSchema(client, obj.schema, obj.name);
                case 'view':
                    return await this._getViewSchema(client, obj.schema, obj.name);
                case 'function':
                    return await this._getFunctionSchema(client, obj.schema, obj.name);
                case 'materialized-view':
                    return await this._getMaterializedViewSchema(client, obj.schema, obj.name);
                case 'type':
                    return await this._getTypeSchema(client, obj.schema, obj.name);
                case 'schema':
                    return await this._getSchemaInfo(client, obj.schema);
                default:
                    return 'Unknown object type';
            }
        } catch (e) {
            return 'Error fetching schema: ' + e;
        }
    }

    private async _getTableSchema(client: Client, schema: string, table: string): Promise<string> {
        let info = `## Table: ${schema}.${table}\n\n`;

        const cols = await client.query(
            'SELECT column_name, data_type, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
            [schema, table]
        );
        
        info += '### Columns\n| Column | Type | Nullable | Default |\n|--------|------|----------|---------|\n';
        for (const col of cols.rows) {
            let dtype = col.data_type;
            if (col.character_maximum_length) { dtype += `(${col.character_maximum_length})`; }
            else if (col.numeric_precision) { dtype += `(${col.numeric_precision},${col.numeric_scale || 0})`; }
            info += `| ${col.column_name} | ${dtype} | ${col.is_nullable} | ${col.column_default || '-'} |\n`;
        }

        const pk = await client.query(
            "SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY' ORDER BY kcu.ordinal_position",
            [schema, table]
        );
        if (pk.rows.length > 0) {
            info += `\n### Primary Key\n${pk.rows.map((r: any) => r.column_name).join(', ')}\n`;
        }

        const fks = await client.query(
            "SELECT tc.constraint_name, kcu.column_name, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'FOREIGN KEY'",
            [schema, table]
        );
        if (fks.rows.length > 0) {
            info += '\n### Foreign Keys\n';
            for (const fk of fks.rows) {
                info += `- ${fk.constraint_name}: ${fk.column_name} → ${fk.ref_schema}.${fk.ref_table}(${fk.ref_column})\n`;
            }
        }

        const idxs = await client.query(
            'SELECT i.relname as index_name, ix.indisunique, ix.indisprimary, array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) WHERE n.nspname = $1 AND t.relname = $2 GROUP BY i.relname, ix.indisunique, ix.indisprimary',
            [schema, table]
        );
        if (idxs.rows.length > 0) {
            info += '\n### Indexes\n';
            for (const idx of idxs.rows) {
                const flags = [];
                if (idx.indisprimary) { flags.push('PRIMARY'); }
                if (idx.indisunique && !idx.indisprimary) { flags.push('UNIQUE'); }
                // Handle columns - could be array or string depending on pg driver version
                const columns = Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns || '');
                info += `- ${idx.index_name} (${columns})${flags.length ? ' [' + flags.join(', ') + ']' : ''}\n`;
            }
        }

        const count = await client.query(
            'SELECT reltuples::bigint as estimate FROM pg_class WHERE relname = $1 AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)',
            [table, schema]
        );
        if (count.rows.length > 0) {
            info += `\n### Estimated Row Count: ~${Number(count.rows[0].estimate).toLocaleString()}\n`;
        }

        return info;
    }

    private async _getViewSchema(client: Client, schema: string, view: string): Promise<string> {
        let info = `## View: ${schema}.${view}\n\n`;

        const cols = await client.query(
            'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
            [schema, view]
        );
        
        info += '### Columns\n| Column | Type |\n|--------|------|\n';
        for (const col of cols.rows) {
            info += `| ${col.column_name} | ${col.data_type} |\n`;
        }

        const def = await client.query('SELECT definition FROM pg_views WHERE schemaname = $1 AND viewname = $2', [schema, view]);
        if (def.rows.length > 0) {
            info += `\n### Definition\n\`\`\`sql\n${def.rows[0].definition}\`\`\`\n`;
        }

        return info;
    }

    private async _getFunctionSchema(client: Client, schema: string, func: string): Promise<string> {
        const result = await client.query(
            'SELECT p.proname, pg_get_functiondef(p.oid) as definition, pg_get_function_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as return_type, l.lanname as language, p.provolatile, p.proisstrict FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid JOIN pg_language l ON p.prolang = l.oid WHERE n.nspname = $1 AND p.proname = $2',
            [schema, func]
        );

        if (result.rows.length === 0) { return `Function ${schema}.${func} not found`; }

        const fn = result.rows[0];
        let info = `## Function: ${schema}.${fn.proname}\n\n`;
        info += `### Signature\n\`${fn.proname}(${fn.arguments}) → ${fn.return_type}\`\n\n`;
        info += `### Properties\n- Language: ${fn.language}\n`;
        const volatility = fn.provolatile === 'i' ? 'IMMUTABLE' : fn.provolatile === 's' ? 'STABLE' : 'VOLATILE';
        info += `- Volatility: ${volatility}\n`;
        info += `- Strict: ${fn.proisstrict ? 'Yes' : 'No'}\n\n`;
        info += `### Definition\n\`\`\`sql\n${fn.definition}\`\`\`\n`;

        return info;
    }

    private async _getMaterializedViewSchema(client: Client, schema: string, matview: string): Promise<string> {
        let info = `## Materialized View: ${schema}.${matview}\n\n`;

        const cols = await client.query(
            'SELECT attname as column_name, format_type(atttypid, atttypmod) as data_type FROM pg_attribute WHERE attrelid = (SELECT oid FROM pg_class WHERE relname = $2 AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)) AND attnum > 0 AND NOT attisdropped ORDER BY attnum',
            [schema, matview]
        );
        
        info += '### Columns\n| Column | Type |\n|--------|------|\n';
        for (const col of cols.rows) {
            info += `| ${col.column_name} | ${col.data_type} |\n`;
        }

        const def = await client.query('SELECT definition FROM pg_matviews WHERE schemaname = $1 AND matviewname = $2', [schema, matview]);
        if (def.rows.length > 0) {
            info += `\n### Definition\n\`\`\`sql\n${def.rows[0].definition}\`\`\`\n`;
        }

        return info;
    }

    private async _getTypeSchema(client: Client, schema: string, typeName: string): Promise<string> {
        let info = `## Type: ${schema}.${typeName}\n\n`;

        const attrs = await client.query(
            'SELECT a.attname, format_type(a.atttypid, a.atttypmod) as data_type FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid JOIN pg_attribute a ON a.attrelid = t.typrelid WHERE n.nspname = $1 AND t.typname = $2 AND a.attnum > 0 ORDER BY a.attnum',
            [schema, typeName]
        );
        
        if (attrs.rows.length > 0) {
            info += '### Attributes\n| Name | Type |\n|------|------|\n';
            for (const attr of attrs.rows) {
                info += `| ${attr.attname} | ${attr.data_type} |\n`;
            }
        }

        return info;
    }

    private async _getSchemaInfo(client: Client, schema: string): Promise<string> {
        let info = `## Schema: ${schema}\n\n`;

        const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'", [schema]);
        const views = await client.query('SELECT table_name FROM information_schema.views WHERE table_schema = $1', [schema]);
        const funcs = await client.query('SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1', [schema]);

        info += `### Summary\n- Tables: ${tables.rows.length}\n- Views: ${views.rows.length}\n- Functions: ${funcs.rows.length}\n\n`;

        if (tables.rows.length > 0) {
            info += '### Tables\n' + tables.rows.map((r: any) => `- ${r.table_name}`).join('\n') + '\n\n';
        }
        if (views.rows.length > 0) {
            info += '### Views\n' + views.rows.map((r: any) => `- ${r.table_name}`).join('\n') + '\n\n';
        }
        if (funcs.rows.length > 0) {
            info += '### Functions\n' + funcs.rows.map((r: any) => `- ${r.routine_name}`).join('\n') + '\n';
        }

        return info;
    }

    getCache(): DbObject[] {
        return this._cache;
    }

    searchObjects(query: string): DbObject[] {
        const lowerQuery = query.toLowerCase();
        return this._cache.filter(obj => 
            obj.name.toLowerCase().includes(lowerQuery) ||
            obj.type.toLowerCase().includes(lowerQuery) ||
            obj.schema.toLowerCase().includes(lowerQuery)
        ).slice(0, 20);
    }
}
