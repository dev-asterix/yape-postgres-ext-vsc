import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import {
  MarkdownUtils,
  FormatHelpers,
  ErrorHandlers,

  QueryBuilder,
  NotebookBuilder,
  getDatabaseConnection,
  validateRoleItem
} from './helper';
import { UsersRolesSQL } from './sql';

/**
 * SQL Queries for role operations
 */

/**
 * ROLE_DETAILS_QUERY - Query to get detailed role information including attributes, memberships, and privileges
 */


/**
 * Show role properties in a notebook
 */
export async function cmdShowRoleProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { client, metadata } = dbConn;

    const roleName = item.label;

    const roleResult = await client.query(QueryBuilder.roleDetails(roleName));
    if (roleResult.rows.length === 0) {
      vscode.window.showErrorMessage('Role not found');
      return;
    }

    const role = roleResult.rows[0];

    // Build role attributes list
    const attributes = [];
    if (role.rolsuper) attributes.push('⚡ SUPERUSER');
    if (role.rolcanlogin) attributes.push('🔑 LOGIN');
    if (role.rolcreatedb) attributes.push('🗄️ CREATEDB');
    if (role.rolcreaterole) attributes.push('👥 CREATEROLE');
    if (role.rolreplication) attributes.push('🔁 REPLICATION');
    if (role.rolbypassrls) attributes.push('🛡️ BYPASSRLS');
    if (role.rolinherit) attributes.push('👪 INHERIT');

    let markdown = MarkdownUtils.header(`👤 Role Properties: \`${roleName}\``) +
      MarkdownUtils.infoBox('Execute the queries below to get the latest role information from the database.') +
      '\n\n#### 🎭 Role Attributes\n\n' +
      MarkdownUtils.propertiesTable({
        'Role Name': `<code>${role.rolname}</code>`,
        'Superuser': FormatHelpers.formatBoolean(role.rolsuper),
        'Can Login': FormatHelpers.formatBoolean(role.rolcanlogin),
        'Create DB': FormatHelpers.formatBoolean(role.rolcreatedb),
        'Create Role': FormatHelpers.formatBoolean(role.rolcreaterole),
        'Replication': FormatHelpers.formatBoolean(role.rolreplication),
        'Bypass RLS': FormatHelpers.formatBoolean(role.rolbypassrls),
        'Inherit': FormatHelpers.formatBoolean(role.rolinherit),
        'Connection Limit': role.rolconnlimit === -1 ? 'Unlimited' : '' + role.rolconnlimit,
        'Valid Until': role.rolvaliduntil ? '' + role.rolvaliduntil : '∞'
      });

    if (attributes.length > 0) {
      markdown += '\n\n#### 🔑 Active Privileges\n\n' + attributes.join(' | ');
    }

    // Memberships
    if (role.member_of && role.member_of.length > 0) {
      markdown += '\n\n#### 👪 Member Of\n\n- ' + role.member_of.join('\n- ');
    }

    if (role.members && role.members.length > 0) {
      markdown += '\n\n#### 👥 Has Members\n\n- ' + role.members.join('\n- ');
    }

    // Accessible databases
    if (role.accessible_databases && role.accessible_databases.length > 0) {
      markdown += '\n\n#### 🗄️ Accessible Databases\n\n- ' + role.accessible_databases.join('\n- ');
    }

    markdown += '\n\n---';

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 🔍 Query Role Attributes')
      .addSql(UsersRolesSQL.roleAttributes(roleName))
      .addMarkdown('##### 👪 Role Memberships')
      .addSql(UsersRolesSQL.roleMemberships(roleName))
      .addMarkdown('##### 🔐 Granted Privileges')
      .addSql(UsersRolesSQL.grantedPrivileges(roleName))
      .show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show role properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Copy role name to clipboard
 */
export async function copyRoleName(item: DatabaseTreeItem): Promise<void> {
  const roleName = item.label;
  await vscode.env.clipboard.writeText(roleName);
  vscode.window.showInformationMessage('Copied: ' + roleName);
}

/**
 * Copy role name quoted to clipboard
 */
export async function copyRoleNameQuoted(item: DatabaseTreeItem): Promise<void> {
  const roleName = item.label;
  await vscode.env.clipboard.writeText('"' + roleName + '"');
  vscode.window.showInformationMessage('Copied: "' + roleName + '"');
}

/**
 * Generate CREATE USER script
 */
export async function cmdAddUser(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('➕ Create New User') +
        MarkdownUtils.infoBox('Users are roles with LOGIN privilege. Modify the template below to create a new user.') +
        '\n\n#### 👤 User Attributes\n\n' +
        MarkdownUtils.operationsTable([
          { operation: 'LOGIN', description: 'Allows the role to connect to the database' },
          { operation: 'PASSWORD', description: 'Sets the authentication password' },
          { operation: 'CREATEDB', description: 'Allows creating new databases' },
          { operation: 'CREATEROLE', description: 'Allows creating new roles' },
          { operation: 'SUPERUSER', description: 'Grants all privileges (use with caution!)' },
          { operation: 'VALID UNTIL', description: 'Sets password expiration date' }
        ])
      )
      .addSql(UsersRolesSQL.createUser(item.databaseName || 'database_name'))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create user notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate CREATE ROLE script
 */
export async function cmdAddRole(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('➕ Create New Role') +
        MarkdownUtils.infoBox('Roles are used to manage database access permissions. Roles without LOGIN are typically used for grouping privileges.') +
        '\n\n#### 🛡️ Role Attributes\n\n' +
        MarkdownUtils.operationsTable([
          { operation: 'NOLOGIN', description: 'Role cannot connect directly (default for roles)' },
          { operation: 'INHERIT', description: 'Role inherits privileges from member roles' },
          { operation: 'CREATEDB', description: 'Role can create databases' },
          { operation: 'CREATEROLE', description: 'Role can create other roles' }
        ])
      )
      .addSql(UsersRolesSQL.createRole())
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create role notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate ALTER ROLE script
 */
export async function cmdEditRole(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✏️ Edit Role: \`${item.label}\``) +
        MarkdownUtils.infoBox('Modify the role\'s attributes using ALTER ROLE. Changes take effect immediately.') +
        '\n\n#### 🛠️ Available Modifications\n\n' +
        MarkdownUtils.operationsTable([
          { operation: 'PASSWORD', description: 'Change the role password' },
          { operation: 'LOGIN/NOLOGIN', description: 'Enable or disable login capability' },
          { operation: 'SUPERUSER', description: 'Grant or revoke superuser status' },
          { operation: 'CREATEDB', description: 'Grant or revoke database creation' },
          { operation: 'CREATEROLE', description: 'Grant or revoke role creation' },
          { operation: 'VALID UNTIL', description: 'Set password expiration' }
        ])
      )
      .addSql(UsersRolesSQL.alterRole(item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'edit role');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate GRANT/REVOKE script
 */
export async function cmdGrantRevokeRole(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { metadata } = dbConn;

    const dbName = item.databaseName || 'database_name';

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔐 Manage Privileges: \`${item.label}\``) +
        MarkdownUtils.infoBox('Grant or revoke privileges for this role. Uncomment the operations you want to execute.') +
        '\n\n#### 🔑 Privilege Levels\n\n' +
        MarkdownUtils.operationsTable([
          { operation: 'Database', description: 'CONNECT, CREATE, TEMP privileges' },
          { operation: 'Schema', description: 'USAGE, CREATE privileges' },
          { operation: 'Table', description: 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER' },
          { operation: 'Function', description: 'EXECUTE privilege' },
          { operation: 'Sequence', description: 'USAGE, SELECT, UPDATE privileges' }
        ])
      )
      .addMarkdown('##### 🗄️ Database Privileges')
      .addSql(UsersRolesSQL.privileges.database(item.label, dbName))
      .addMarkdown('##### 📂 Schema Privileges')
      .addSql(UsersRolesSQL.privileges.schema(item.label))
      .addMarkdown('##### 📊 Table Privileges')
      .addSql(UsersRolesSQL.privileges.table(item.label))
      .addMarkdown('##### ⚡ Function & Sequence Privileges')
      .addSql(UsersRolesSQL.privileges.function(item.label))
      .addMarkdown('##### 👥 Role Membership')
      .addSql(UsersRolesSQL.privileges.roleMembership(item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'manage privileges');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate DROP ROLE script
 */
export async function cmdDropRole(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop Role: \`${item.label}\``) +
        MarkdownUtils.dangerBox('This will permanently delete the role. All objects owned by this role must be reassigned or dropped first.') +
        '\n\n#### ⚠️ Before Dropping\n\n' +
        '1. **Reassign owned objects** to another role\n' +
        '2. **Drop owned objects** if no longer needed\n' +
        '3. **Revoke privileges** granted to this role\n' +
        '4. **Remove role memberships**\n\n' +
        MarkdownUtils.warningBox('Cannot drop a role that owns objects or has privileges on objects.')
      )
      .addSql(UsersRolesSQL.dropRole(item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'drop role');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Show role operations notebook
 */
export async function cmdRoleOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🛠️ Role Operations: \`${item.label}\``) +
        MarkdownUtils.infoBox('This notebook provides a dashboard for managing your role. Each cell is a ready-to-execute template.') +
        '\n\n#### ⚡ Available Operations\n\n' +
        MarkdownUtils.operationsTable([
          { operation: '🔍 View Attributes', description: 'Display role settings and configuration', riskLevel: '🟢 Safe' },
          { operation: '👥 View Memberships', description: 'Show role membership hierarchy', riskLevel: '🟢 Safe' },
          { operation: '🔑 View Privileges', description: 'List all granted privileges', riskLevel: '🟢 Safe' },
          { operation: '✏️ Modify Role', description: 'Change role attributes', riskLevel: '🟡 Low Risk' },
          { operation: '🔑 Change Password', description: 'Update role password', riskLevel: '🟡 Low Risk' },
          { operation: '❌ Drop Role', description: 'Remove role permanently', riskLevel: '🔴 Destructive' }
        ]) + '\n' +
        MarkdownUtils.successBox('Use Ctrl+Enter to execute individual cells.') +
        '\n---'
      )
      .addMarkdown('##### 🔍 View Role Attributes')
      .addSql(`-- View role attributes\nSELECT \n    r.rolname as "Name",\n    r.rolsuper as "Superuser",\n    r.rolinherit as "Inherit",\n    r.rolcreaterole as "Create Role",\n    r.rolcreatedb as "Create DB",\n    r.rolcanlogin as "Can Login",\n    r.rolreplication as "Replication",\n    r.rolconnlimit as "Connection Limit",\n    r.rolvaliduntil as "Valid Until",\n    r.rolbypassrls as "Bypass RLS",\n    pg_catalog.shobj_description(r.oid, 'pg_authid') as "Description"\nFROM pg_roles r\nWHERE r.rolname = '${item.label}';`)
      .addMarkdown('##### 👥 Role Memberships')
      .addSql(`-- Roles this role belongs to\nSELECT \n    m.rolname as "Member Of",\n    g.rolname as "Granted By",\n    am.admin_option as "Admin Option"\nFROM pg_auth_members am\nJOIN pg_roles r ON r.oid = am.member\nJOIN pg_roles m ON m.oid = am.roleid\nJOIN pg_roles g ON g.oid = am.grantor\nWHERE r.rolname = '${item.label}';\n\n-- Roles that belong to this role\nSELECT \n    m.rolname as "Has Member",\n    g.rolname as "Granted By",\n    am.admin_option as "Admin Option"\nFROM pg_auth_members am\nJOIN pg_roles r ON r.oid = am.roleid\nJOIN pg_roles m ON m.oid = am.member\nJOIN pg_roles g ON g.oid = am.grantor\nWHERE r.rolname = '${item.label}';`)
      .addMarkdown('##### 🔑 Granted Privileges')
      .addSql(`-- Table privileges\nSELECT \n    table_schema as "Schema",\n    table_name as "Table",\n    privilege_type as "Privilege",\n    is_grantable as "Grantable"\nFROM information_schema.table_privileges\nWHERE grantee = '${item.label}'\nORDER BY table_schema, table_name, privilege_type;\n\n-- Schema privileges\nSELECT \n    n.nspname as "Schema",\n    'USAGE' as "Privilege"\nFROM pg_namespace n\nWHERE has_schema_privilege('${item.label}', n.nspname, 'USAGE')\nAND n.nspname NOT LIKE 'pg_%'\nAND n.nspname != 'information_schema';`)
      .addMarkdown('##### ✏️ Modify Role')
      .addSql(`-- Modify role attributes\nALTER ROLE ${item.label}\n    -- Uncomment and modify:\n    -- WITH PASSWORD 'new_password'\n    -- SUPERUSER | NOSUPERUSER\n    -- CREATEDB | NOCREATEDB\n    -- CREATEROLE | NOCREATEROLE\n    -- LOGIN | NOLOGIN\n    -- VALID UNTIL '2025-12-31'\n;`)
      .addMarkdown('##### 🔑 Change Password')
      .addSql(`-- Change role password\nALTER ROLE ${item.label} WITH PASSWORD 'new_secure_password';\n\n-- Set password with expiration\n-- ALTER ROLE ${item.label} WITH PASSWORD 'new_password' VALID UNTIL '2025-12-31';`)
      .addMarkdown(MarkdownUtils.dangerBox('The following operation is destructive and cannot be undone.') + '\n\n##### ❌ Drop Role')
      .addSql(`-- Reassign owned objects first\n-- REASSIGN OWNED BY ${item.label} TO postgres;\n\n-- Drop owned objects\n-- DROP OWNED BY ${item.label};\n\n-- Drop the role\n-- DROP ROLE ${item.label};`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show role operations');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * View role dependencies
 */
export async function viewRoleDependencies(item: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateRoleItem);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔗 Role Dependencies: \`${item.label}\``) +
        MarkdownUtils.infoBox('Shows objects owned by or dependent on this role.')
      )
      .addSql(UsersRolesSQL.roleDependencies(item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'view role dependencies');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Refresh role in tree view
 */
export async function cmdRefreshRole(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider): Promise<void> {
  databaseTreeProvider?.refresh(item);
}
