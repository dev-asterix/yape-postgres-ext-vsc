import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { migrateExistingPasswords } from '../../password';
import { suite, test, setup, teardown } from 'mocha';

suite('Extension Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let updateStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    updateStub = sandbox.stub().resolves();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('migrateExistingPasswords should not lose passwords on SecretStorage failure', async () => {
    // Arrange
    const connections = [
      { id: '1', name: 'test', host: 'localhost', port: 5432, username: 'user', password: 'password123' }
    ];

    sandbox.stub(vscode.workspace, 'getConfiguration').returns({
      get: sandbox.stub().withArgs('postgresExplorer.connections').returns(connections),
      update: updateStub
    } as any);

    const secretStoreStub = sandbox.stub().rejects(new Error('Failed to store secret'));

    const context: vscode.ExtensionContext = {
      secrets: {
        store: secretStoreStub,
      } as any,
    } as any;

    // Act
    const result = await migrateExistingPasswords(context);

    // Assert
    assert.strictEqual(result, false, 'Function should return false on failure');
    assert.ok(updateStub.notCalled, 'Configuration should not be updated if storing secrets fails');
  });
});
