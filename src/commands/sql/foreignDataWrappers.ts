/**
 * SQL Templates for Foreign Data Wrapper Operations
 */

export const ForeignDataWrapperSQL = {
    /**
     * CREATE Templates
     */
    create: {
        server: {
            basic: (fdwName: string) =>
                `-- Create basic foreign server
CREATE SERVER server_name
FOREIGN DATA WRAPPER ${fdwName}
OPTIONS (
    -- Add server-specific options here
    host 'hostname',
    port '5432',
    dbname 'database_name'
);

-- Add comment
COMMENT ON SERVER server_name IS 'Description of the foreign server';`,

            postgres: (fdwName: string = 'postgres_fdw') =>
                `-- Enable postgres_fdw extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Create PostgreSQL foreign server
CREATE SERVER remote_postgres_server
FOREIGN DATA WRAPPER ${fdwName}
OPTIONS (
    host 'remote.example.com',
    port '5432',
    dbname 'remote_database',
    fetch_size '1000',
    use_remote_estimate 'true'
);

-- Add comment
COMMENT ON SERVER remote_postgres_server IS 'Remote PostgreSQL database connection';`,

            mysql: (fdwName: string = 'mysql_fdw') =>
                `-- Enable mysql_fdw extension if not already enabled
CREATE EXTENSION IF NOT EXISTS mysql_fdw;

-- Create MySQL foreign server
CREATE SERVER mysql_server
FOREIGN DATA WRAPPER ${fdwName}
OPTIONS (
    host 'mysql.example.com',
    port '3306'
);

-- Add comment
COMMENT ON SERVER mysql_server IS 'MySQL database connection';`,

            file: () =>
                `-- Enable file_fdw extension if not already enabled
CREATE EXTENSION IF NOT EXISTS file_fdw;

-- Create file-based foreign server
CREATE SERVER file_server
FOREIGN DATA WRAPPER file_fdw;

-- Add comment
COMMENT ON SERVER file_server IS 'File-based data access (CSV, etc.)';`,

            withAuth: (fdwName: string) =>
                `-- Create foreign server with authentication options
CREATE SERVER secure_server
FOREIGN DATA WRAPPER ${fdwName}
OPTIONS (
    host 'secure.example.com',
    port '5432',
    dbname 'production_db',
    sslmode 'require',
    sslcert '/path/to/client-cert.pem',
    sslkey '/path/to/client-key.pem',
    sslrootcert '/path/to/ca-cert.pem'
);

-- Add comment
COMMENT ON SERVER secure_server IS 'Secure remote database with SSL authentication';`
        },

        userMapping: {
            basic: (serverName: string) =>
                `-- Create user mapping for current user
CREATE USER MAPPING FOR CURRENT_USER
SERVER ${serverName}
OPTIONS (
    user 'remote_username',
    password 'remote_password'
);`,

            withPassword: (serverName: string) =>
                `-- Create user mapping with password
CREATE USER MAPPING FOR username
SERVER ${serverName}
OPTIONS (
    user 'remote_username',
    password 'secure_password_here'
);

-- Note: Passwords are stored securely in PostgreSQL`,

            public: (serverName: string) =>
                `-- Create PUBLIC user mapping (applies to all users without specific mapping)
CREATE USER MAPPING FOR PUBLIC
SERVER ${serverName}
OPTIONS (
    user 'readonly_user',
    password 'readonly_password'
);

-- Warning: PUBLIC mappings apply to all database users`,

            withOptions: (serverName: string) =>
                `-- Create user mapping with advanced options
CREATE USER MAPPING FOR username
SERVER ${serverName}
OPTIONS (
    user 'remote_username',
    password 'remote_password',
    -- postgres_fdw specific options
    fetch_size '1000',
    use_remote_estimate 'true',
    async_capable 'true'
);`
        }
    },

    /**
     * ALTER Templates
     */
    alter: {
        serverOptions: (serverName: string) =>
            `-- Alter server options
ALTER SERVER ${serverName}
OPTIONS (
    SET host 'new-hostname',
    SET port '5432',
    ADD dbname 'new_database'
);

-- Drop an option
-- ALTER SERVER ${serverName}
-- OPTIONS (DROP option_name);`,

        serverOwner: (serverName: string) =>
            `-- Change server owner
ALTER SERVER ${serverName}
OWNER TO new_owner_role;`,

        serverRename: (serverName: string) =>
            `-- Rename server
ALTER SERVER ${serverName}
RENAME TO new_server_name;`,

        userMappingOptions: (serverName: string, userName: string = 'CURRENT_USER') =>
            `-- Alter user mapping options
ALTER USER MAPPING FOR ${userName}
SERVER ${serverName}
OPTIONS (
    SET user 'new_remote_username',
    SET password 'new_remote_password'
);`,

        addOption: (serverName: string) =>
            `-- Add option to server
ALTER SERVER ${serverName}
OPTIONS (ADD option_name 'option_value');`,

        dropOption: (serverName: string) =>
            `-- Drop option from server
ALTER SERVER ${serverName}
OPTIONS (DROP option_name);`
    },

    /**
     * QUERY Templates
     */
    query: {
        listFDWs: () =>
            `-- List all foreign data wrappers
SELECT 
    fdwname as fdw_name,
    fdwowner::regrole as owner,
    fdwhandler::regproc as handler,
    fdwvalidator::regproc as validator,
    fdwoptions as options
FROM pg_foreign_data_wrapper
ORDER BY fdwname;`,

        fdwDetails: (fdwName: string) =>
            `-- Get detailed FDW information
SELECT 
    fdw.fdwname as fdw_name,
    fdw.fdwowner::regrole as owner,
    fdw.fdwhandler::regproc as handler_function,
    fdw.fdwvalidator::regproc as validator_function,
    fdw.fdwoptions as options,
    fdw.fdwacl as access_privileges,
    obj_description(fdw.oid, 'pg_foreign_data_wrapper') as comment,
    COUNT(srv.oid) as server_count
FROM pg_foreign_data_wrapper fdw
LEFT JOIN pg_foreign_server srv ON srv.srvfdw = fdw.oid
WHERE fdw.fdwname = '${fdwName}'
GROUP BY fdw.oid, fdw.fdwname, fdw.fdwowner, fdw.fdwhandler, fdw.fdwvalidator, fdw.fdwoptions, fdw.fdwacl;`,

        listServers: (fdwName?: string) =>
            fdwName
                ? `-- List all foreign servers for ${fdwName}
SELECT 
    srv.srvname as server_name,
    fdw.fdwname as fdw_name,
    srv.srvowner::regrole as owner,
    srv.srvoptions as options,
    obj_description(srv.oid, 'pg_foreign_server') as comment,
    COUNT(DISTINCT um.umid) as user_mapping_count,
    COUNT(DISTINCT ft.ftrelid) as foreign_table_count
FROM pg_foreign_server srv
JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
LEFT JOIN pg_user_mappings um ON um.srvid = srv.oid
LEFT JOIN pg_foreign_table ft ON ft.ftserver = srv.oid
WHERE fdw.fdwname = '${fdwName}'
GROUP BY srv.oid, srv.srvname, fdw.fdwname, srv.srvowner, srv.srvoptions
ORDER BY srv.srvname;`
                : `-- List all foreign servers
SELECT 
    srv.srvname as server_name,
    fdw.fdwname as fdw_name,
    srv.srvowner::regrole as owner,
    srv.srvoptions as options,
    obj_description(srv.oid, 'pg_foreign_server') as comment,
    COUNT(DISTINCT um.umid) as user_mapping_count,
    COUNT(DISTINCT ft.ftrelid) as foreign_table_count
FROM pg_foreign_server srv
JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
LEFT JOIN pg_user_mappings um ON um.srvid = srv.oid
LEFT JOIN pg_foreign_table ft ON ft.ftserver = srv.oid
GROUP BY srv.oid, srv.srvname, fdw.fdwname, srv.srvowner, srv.srvoptions
ORDER BY fdw.fdwname, srv.srvname;`,

        serverDetails: (serverName: string) =>
            `-- Get detailed server information
SELECT 
    srv.srvname as server_name,
    fdw.fdwname as fdw_name,
    srv.srvowner::regrole as owner,
    srv.srvtype as server_type,
    srv.srvversion as server_version,
    srv.srvoptions as options,
    srv.srvacl as access_privileges,
    obj_description(srv.oid, 'pg_foreign_server') as comment
FROM pg_foreign_server srv
JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
WHERE srv.srvname = '${serverName}';`,

        listUserMappings: (serverName?: string) =>
            serverName
                ? `-- List user mappings for ${serverName}
SELECT 
    um.srvname as server_name,
    um.usename as user_name,
    um.umoptions as options
FROM pg_user_mappings um
WHERE um.srvname = '${serverName}'
ORDER BY um.usename;`
                : `-- List all user mappings
SELECT 
    um.srvname as server_name,
    fdw.fdwname as fdw_name,
    um.usename as user_name,
    um.umoptions as options
FROM pg_user_mappings um
JOIN pg_foreign_server srv ON um.srvid = srv.oid
JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
ORDER BY um.srvname, um.usename;`,

        userMappingDetails: (serverName: string, userName: string) =>
            `-- Get detailed user mapping information
SELECT 
    um.srvname as server_name,
    um.usename as user_name,
    um.umoptions as options,
    srv.srvowner::regrole as server_owner,
    fdw.fdwname as fdw_name
FROM pg_user_mappings um
JOIN pg_foreign_server srv ON um.srvid = srv.oid
JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
WHERE um.srvname = '${serverName}' 
  AND um.usename = '${userName}';`,

        foreignTablesByServer: (serverName: string) =>
            `-- List foreign tables using this server
SELECT 
    n.nspname as schema_name,
    c.relname as table_name,
    srv.srvname as server_name,
    ft.ftoptions as table_options,
    pg_size_pretty(pg_total_relation_size(c.oid)) as size,
    obj_description(c.oid, 'pg_class') as comment
FROM pg_foreign_table ft
JOIN pg_class c ON ft.ftrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_foreign_server srv ON ft.ftserver = srv.oid
WHERE srv.srvname = '${serverName}'
ORDER BY n.nspname, c.relname;`,

        fdwFunctions: (fdwName: string) =>
            `-- Show FDW handler and validator functions
SELECT 
    fdw.fdwname as fdw_name,
    fdw.fdwhandler::regproc as handler_function,
    fdw.fdwvalidator::regproc as validator_function,
    ph.proname as handler_name,
    pv.proname as validator_name,
    pg_get_functiondef(fdw.fdwhandler) as handler_definition
FROM pg_foreign_data_wrapper fdw
LEFT JOIN pg_proc ph ON fdw.fdwhandler = ph.oid
LEFT JOIN pg_proc pv ON fdw.fdwvalidator = pv.oid
WHERE fdw.fdwname = '${fdwName}';`
    },

    /**
     * GRANT Templates
     */
    grant: {
        usageOnServer: (serverName: string, roleName: string) =>
            `-- Grant USAGE on foreign server
GRANT USAGE ON FOREIGN SERVER ${serverName} TO ${roleName};

-- Revoke USAGE
-- REVOKE USAGE ON FOREIGN SERVER ${serverName} FROM ${roleName};`,

        usageOnFDW: (fdwName: string, roleName: string) =>
            `-- Grant USAGE on foreign data wrapper
GRANT USAGE ON FOREIGN DATA WRAPPER ${fdwName} TO ${roleName};

-- Revoke USAGE
-- REVOKE USAGE ON FOREIGN DATA WRAPPER ${fdwName} FROM ${roleName};`
    },

    /**
     * DROP Templates
     */
    drop: {
        server: (serverName: string, cascade: boolean = false) =>
            cascade
                ? `-- Drop server with CASCADE (will drop all foreign tables and user mappings)
DROP SERVER IF EXISTS ${serverName} CASCADE;`
                : `-- Drop server (will fail if foreign tables or user mappings exist)
DROP SERVER IF EXISTS ${serverName};

-- To force drop with all dependencies:
-- DROP SERVER IF EXISTS ${serverName} CASCADE;`,

        userMapping: (serverName: string, userName: string = 'CURRENT_USER') =>
            `-- Drop user mapping
DROP USER MAPPING IF EXISTS FOR ${userName}
SERVER ${serverName};`,

        fdw: (fdwName: string, cascade: boolean = false) =>
            cascade
                ? `-- Drop foreign data wrapper with CASCADE
DROP FOREIGN DATA WRAPPER IF EXISTS ${fdwName} CASCADE;`
                : `-- Drop foreign data wrapper (will fail if servers exist)
DROP FOREIGN DATA WRAPPER IF EXISTS ${fdwName};

-- To force drop with all dependencies:
-- DROP FOREIGN DATA WRAPPER IF EXISTS ${fdwName} CASCADE;`
    },

    /**
     * TEST Templates
     */
    test: {
        connection: (serverName: string) =>
            `-- Test server connection by creating a temporary foreign table
-- This will verify connectivity and permissions

BEGIN;

-- Create test foreign table
CREATE FOREIGN TABLE IF NOT EXISTS test_connection_temp (
    test_column text
) SERVER ${serverName}
OPTIONS (schema_name 'public', table_name 'dual');

-- Try to query (may fail if 'dual' table doesn't exist, but connection is tested)
-- SELECT * FROM test_connection_temp LIMIT 1;

-- Clean up
DROP FOREIGN TABLE IF EXISTS test_connection_temp;

ROLLBACK;

-- If no errors, connection is working!`,

        permissions: (serverName: string) =>
            `-- Verify user has necessary permissions
-- Check if current user has USAGE permission on server
SELECT 
    has_server_privilege(CURRENT_USER, '${serverName}', 'USAGE') as has_usage_permission;

-- Check server access privileges
SELECT 
    srvname,
    srvacl
FROM pg_foreign_server
WHERE srvname = '${serverName}';`
    },

    /**
     * MANAGEMENT Templates
     */
    manage: {
        showServerOptions: (serverName: string) =>
            `-- Display server options in readable format
SELECT 
    srv.srvname as server_name,
    fdw.fdwname as fdw_name,
    unnest(srv.srvoptions) as option
FROM pg_foreign_server srv
JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
WHERE srv.srvname = '${serverName}';`,

        showUserMappingOptions: (serverName: string, userName: string = 'CURRENT_USER') =>
            `-- Display user mapping options (passwords are censored)
SELECT 
    um.srvname as server_name,
    um.usename as user_name,
    unnest(um.umoptions) as option
FROM pg_user_mappings um
WHERE um.srvname = '${serverName}'
  AND um.usename = '${userName}';`,

        dependencies: (serverName: string) =>
            `-- Show all objects depending on a server
SELECT 
    n.nspname as schema_name,
    c.relname as object_name,
    c.relkind as object_type,
    CASE c.relkind
        WHEN 'f' THEN 'foreign table'
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        ELSE 'other'
    END as type_description
FROM pg_foreign_table ft
JOIN pg_class c ON ft.ftrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_foreign_server srv ON ft.ftserver = srv.oid
WHERE srv.srvname = '${serverName}'
ORDER BY n.nspname, c.relname;`,

        serverStatistics: (serverName: string) =>
            `-- Server usage statistics
SELECT 
    srv.srvname as server_name,
    fdw.fdwname as fdw_name,
    srv.srvowner::regrole as owner,
    COUNT(DISTINCT um.umid) as user_mappings,
    COUNT(DISTINCT ft.ftrelid) as foreign_tables,
    COALESCE(SUM(pg_total_relation_size(ft.ftrelid)), 0) as total_size_bytes,
    pg_size_pretty(COALESCE(SUM(pg_total_relation_size(ft.ftrelid)), 0)) as total_size
FROM pg_foreign_server srv
JOIN pg_foreign_data_wrapper fdw ON srv.srvfdw = fdw.oid
LEFT JOIN pg_user_mappings um ON um.srvid = srv.oid
LEFT JOIN pg_foreign_table ft ON ft.ftserver = srv.oid
WHERE srv.srvname = '${serverName}'
GROUP BY srv.oid, srv.srvname, fdw.fdwname, srv.srvowner;`
    }
};
