import * as vscode from 'vscode';

export async function migrateExistingPasswords(context: vscode.ExtensionContext) {
    try {
        const config = vscode.workspace.getConfiguration();
        const connections = config.get<any[]>('postgresExplorer.connections') || [];

        if (!connections || connections.length === 0) {
            return true; // Nothing to migrate
        }

        // First, store all passwords in SecretStorage
        for (const conn of connections) {
            if (conn.password) {
                await context.secrets.store(`postgres-password-${conn.id}`, conn.password);
            }
        }

        // Then, if all passwords were stored successfully, remove them from settings
        const sanitizedConnections = connections.map(({ password, ...connWithoutPassword }) => connWithoutPassword);
        await config.update('postgresExplorer.connections', sanitizedConnections, vscode.ConfigurationTarget.Global);

        return true;
    } catch (error) {
        console.error('Failed to migrate passwords:', error);
        // If anything fails, we don't update the configuration, so nothing is lost.
        return false;
    }
}
