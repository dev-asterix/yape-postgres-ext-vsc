import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { PostgresKernel } from '../../providers/NotebookKernel';
import { ConnectionManager } from '../../services/ConnectionManager';

describe('PostgresKernel', () => {
  let sandbox: sinon.SinonSandbox;
  let contextStub: any;
  let controllerStub: any;
  let connectionManagerStub: any;
  let configGetStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    contextStub = {
      subscriptions: []
    };
    controllerStub = {
      createNotebookCellExecution: sandbox.stub().returns({
        start: sandbox.stub(),
        replaceOutput: sandbox.stub(),
        end: sandbox.stub(),
        clearOutput: sandbox.stub()
      }),
      supportedLanguages: [],
      supportsExecutionOrder: false,
      description: '',
      executeHandler: undefined,
      onDidReceiveMessage: sandbox.stub()
    };

    // Mock vscode.notebooks.createNotebookController
    sandbox.stub(vscode.notebooks, 'createNotebookController').returns(controllerStub);

    // Mock ConnectionManager
    connectionManagerStub = {
      getConnection: sandbox.stub()
    };
    sandbox.stub(ConnectionManager, 'getInstance').returns(connectionManagerStub);

    // Mock vscode.workspace.getConfiguration
    configGetStub = sandbox.stub().returns([]);
    sandbox.stub(vscode.workspace, 'getConfiguration').returns({
      get: configGetStub
    } as any);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should initialize correctly', () => {
    const kernel = new PostgresKernel(contextStub);
    expect(controllerStub.supportedLanguages).to.include('sql');
    expect(controllerStub.supportsExecutionOrder).to.be.true;
  });

  it('should handle execution failure when no connection metadata', async () => {
    const kernel = new PostgresKernel(contextStub);
    const cell: any = {
      notebook: { metadata: {} },
      document: { uri: { toString: () => 'cell-uri' } }
    };

    await (kernel as any)._executor.executeCell(cell);

    const execution = controllerStub.createNotebookCellExecution.firstCall.returnValue;
    expect(execution.end.calledWith(false)).to.be.true;
    expect(execution.replaceOutput.called).to.be.true;
  });

  it('should execute query successfully', async () => {
    const kernel = new PostgresKernel(contextStub);
    const cell: any = {
      notebook: { metadata: { connectionId: 'test-conn' } },
      document: {
        uri: { toString: () => 'cell-uri' },
        getText: () => 'SELECT * FROM users'
      }
    };

    const connectionConfig = {
      id: 'test-conn',
      name: 'Test DB',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'db'
    };
    configGetStub.returns([connectionConfig]);

    const clientStub = {
      query: sandbox.stub().resolves({
        rows: [{ id: 1, name: 'Test' }],
        fields: [{ name: 'id' }, { name: 'name' }]
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    await (kernel as any)._executor.executeCell(cell);

    const execution = controllerStub.createNotebookCellExecution.firstCall.returnValue;
    expect(execution.end.calledWith(true)).to.be.true;
    expect(execution.replaceOutput.called).to.be.true;

    const output = execution.replaceOutput.firstCall.args[0][0];
    expect(output.items[0].mime).to.equal('text/html');
    expect(output.items[0].data.toString()).to.contain('Test');
  });

  it('should format complex objects in query results', async () => {
    const kernel = new PostgresKernel(contextStub);
    const cell: any = {
      notebook: { metadata: { connectionId: 'test-conn' } },
      document: {
        uri: { toString: () => 'cell-uri' },
        getText: () => 'SELECT * FROM complex'
      }
    };

    const connectionConfig = {
      id: 'test-conn',
      name: 'Test DB',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'db'
    };
    configGetStub.returns([connectionConfig]);

    const clientStub = {
      query: sandbox.stub().resolves({
        rows: [{ data: { foo: 'bar' }, nullVal: null }],
        fields: [{ name: 'data' }, { name: 'nullVal' }]
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    await (kernel as any)._executor.executeCell(cell);

    const execution = controllerStub.createNotebookCellExecution.firstCall.returnValue;
    const output = execution.replaceOutput.firstCall.args[0][0];
    expect(output.items[0].data.toString()).to.contain('{"foo":"bar"}');
  });

  it('should execute all cells', async () => {
    const kernel = new PostgresKernel(contextStub);
    const cell1: any = {
      notebook: { metadata: { connectionId: 'test-conn' } },
      document: {
        uri: { toString: () => 'cell-uri-1' },
        getText: () => 'SELECT 1'
      }
    };
    const cell2: any = {
      notebook: { metadata: { connectionId: 'test-conn' } },
      document: {
        uri: { toString: () => 'cell-uri-2' },
        getText: () => 'SELECT 2'
      }
    };

    const connectionConfig = {
      id: 'test-conn',
      name: 'Test DB',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'db'
    };
    configGetStub.returns([connectionConfig]);

    const clientStub = {
      query: sandbox.stub().resolves({
        rows: [],
        fields: []
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    // Trigger executeHandler
    await controllerStub.executeHandler([cell1, cell2], {}, controllerStub);

    expect(controllerStub.createNotebookCellExecution.calledTwice).to.be.true;
  });

  it('should execute DDL command successfully', async () => {
    const kernel = new PostgresKernel(contextStub);
    const cell: any = {
      notebook: { metadata: { connectionId: 'test-conn' } },
      document: {
        uri: { toString: () => 'cell-uri' },
        getText: () => 'CREATE TABLE test (id int)'
      }
    };

    const connectionConfig = {
      id: 'test-conn',
      name: 'Test DB',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'db'
    };
    configGetStub.returns([connectionConfig]);

    const clientStub = {
      query: sandbox.stub().resolves({
        command: 'CREATE',
        rowCount: 0,
        rows: [],
        fields: []
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    await (kernel as any)._executor.executeCell(cell);

    const execution = controllerStub.createNotebookCellExecution.firstCall.returnValue;
    expect(execution.end.calledWith(true)).to.be.true;
    const output = execution.replaceOutput.firstCall.args[0][0];
    expect(output.items[0].data.toString()).to.contain('Query executed successfully');
  });

  it('should provide SQL keyword completions', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 'SEL', substr: () => 'sel' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'sel'
    };
    const position: any = { character: 3 };

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items.find((i: any) => i.label === 'SELECT')).to.exist;
  });

  it('should provide column completions for table alias', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 't.', substr: () => 't.' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT * FROM public.users AS t WHERE t.'
    };
    const position: any = { character: 2 };

    // Mock notebook documents to find connection
    const notebook = {
      getCells: () => [{ document: document, notebook: { metadata: { connectionId: 'test-conn' } } }],
      metadata: { connectionId: 'test-conn' }
    };
    // Since we added notebookDocuments as a property in the mock, we can stub its value
    sandbox.stub(vscode.workspace, 'notebookDocuments').value([notebook]);

    const connectionConfig = {
      id: 'test-conn',
      name: 'Test DB',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'db'
    };
    configGetStub.returns([connectionConfig]);

    const clientStub = {
      query: sandbox.stub().resolves({
        rows: [{ column_name: 'id', data_type: 'int', is_nullable: 'NO' }]
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items.find((i: any) => i.label === 'id')).to.exist;
  });

  it('should provide schema completions', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 'FROM ', substr: () => 'FROM ' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT * FROM '
    };
    const position: any = { character: 5 };

    const notebook = {
      getCells: () => [{ document: document, notebook: { metadata: { connectionId: 'test-conn' } } }],
      metadata: { connectionId: 'test-conn' }
    };
    sandbox.stub(vscode.workspace, 'notebookDocuments').value([notebook]);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    const clientStub = {
      query: sandbox.stub().resolves({
        rows: [{ schema_name: 'public' }]
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items.find((i: any) => i.label === 'public')).to.exist;
  });

  it('should provide simple SQL command completions', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[1]; // The second provider

    const document: any = {
      lineAt: () => ({ text: '', substr: () => '' }), // Empty line
      getWordRangeAtPosition: () => undefined,
      getText: () => ''
    };
    const position: any = { character: 0 };

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items.length).to.be.greaterThan(0);
    expect(items.find((i: any) => i.label === 'SELECT')).to.exist;
  });

  it('should handle serialization errors in query results', async () => {
    new PostgresKernel(contextStub);

    const cell: any = {
      document: {
        getText: () => 'SELECT * FROM users',
        uri: { toString: () => 'test-cell-uri' }
      },
      notebook: { metadata: { connectionId: 'test-conn' } },
      metadata: {}
    };

    const execution = {
      start: sandbox.stub(),
      replaceOutput: sandbox.stub(),
      end: sandbox.stub()
    };
    controllerStub.createNotebookCellExecution.returns(execution);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    // Use BigInt which causes JSON.stringify to throw
    const problematic: any = { a: BigInt(1) };

    const clientStub = {
      query: sandbox.stub().resolves({
        rows: [{ id: 1, data: problematic }],
        fields: [{ name: 'id' }, { name: 'data' }]
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    // Access private method via prototype or cast
    await (PostgresKernel.prototype as any)._doExecution.call({ controller: controllerStub }, cell);

    expect(execution.replaceOutput.called).to.be.true;
    const output = execution.replaceOutput.firstCall.args[0][0];

    if (output.items[0].mime === 'application/vnd.code.notebook.error') {
      require('fs').writeFileSync('/tmp/debug_error.txt', output.items[0].data.toString());
    }

    expect(output.items[0].mime).to.equal('text/html');
    // The data is a Buffer, convert to string to check content
    const htmlContent = output.items[0].data.toString();
    expect(htmlContent).to.contain('output-wrapper');
    expect(htmlContent).to.contain('[object Object]');
  });

  it('should handle connection errors gracefully', async () => {
    new PostgresKernel(contextStub);

    const cell: any = {
      document: { getText: () => 'SELECT 1' },
      notebook: { metadata: { connectionId: 'test-conn' } },
      metadata: {}
    };

    const execution = {
      start: sandbox.stub(),
      replaceOutput: sandbox.stub(),
      end: sandbox.stub()
    };
    controllerStub.createNotebookCellExecution.returns(execution);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    connectionManagerStub.getConnection.rejects(new Error('Connection failed'));

    await (PostgresKernel.prototype as any)._doExecution.call({ controller: controllerStub }, cell);

    expect(execution.replaceOutput.called).to.be.true;
    const output = execution.replaceOutput.firstCall.args[0][0];
    expect(output.items[0].mime).to.equal('application/vnd.code.notebook.error');
  });

  it('should handle missing connection configuration in execution', async () => {
    new PostgresKernel(contextStub);

    const cell: any = {
      document: { getText: () => 'SELECT 1' },
      notebook: { metadata: { connectionId: 'missing-conn' } },
      metadata: {}
    };

    const execution = {
      start: sandbox.stub(),
      replaceOutput: sandbox.stub(),
      end: sandbox.stub()
    };
    controllerStub.createNotebookCellExecution.returns(execution);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    await (PostgresKernel.prototype as any)._doExecution.call({ controller: controllerStub }, cell);

    expect(execution.replaceOutput.called).to.be.true;
    const output = execution.replaceOutput.firstCall.args[0][0];
    expect(output.items[0].mime).to.equal('application/vnd.code.notebook.error');
  });

  it('should provide table completions for schema', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 'public.', substr: () => 'public.' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT * FROM public.'
    };
    const position: any = { character: 7 };

    const notebook = {
      getCells: () => [{ document: document, notebook: { metadata: { connectionId: 'test-conn' } } }],
      metadata: { connectionId: 'test-conn' }
    };
    sandbox.stub(vscode.workspace, 'notebookDocuments').value([notebook]);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    const clientStub = {
      query: sandbox.stub().resolves({
        rows: [{ table_name: 'users' }]
      }),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items.find((i: any) => i.label === 'users')).to.exist;
  });

  it('should handle errors during schema completion', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 'FROM ', substr: () => 'FROM ' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT * FROM '
    };
    const position: any = { character: 5 };

    const notebook = {
      getCells: () => [{ document: document, notebook: { metadata: { connectionId: 'test-conn' } } }],
      metadata: { connectionId: 'test-conn' }
    };
    sandbox.stub(vscode.workspace, 'notebookDocuments').value([notebook]);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    const clientStub = {
      query: sandbox.stub().rejects(new Error('Query failed')),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items).to.be.empty;
  });

  it('should handle errors during column completion', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 't.', substr: () => 't.' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT * FROM public.users AS t WHERE t.'
    };
    const position: any = { character: 2 };

    const notebook = {
      getCells: () => [{ document: document, notebook: { metadata: { connectionId: 'test-conn' } } }],
      metadata: { connectionId: 'test-conn' }
    };
    sandbox.stub(vscode.workspace, 'notebookDocuments').value([notebook]);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    const clientStub = {
      query: sandbox.stub().rejects(new Error('Query failed')),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items).to.be.empty;
  });

  it('should handle errors during table completion', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 'public.', substr: () => 'public.' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT * FROM public.'
    };
    const position: any = { character: 7 };

    const notebook = {
      getCells: () => [{ document: document, notebook: { metadata: { connectionId: 'test-conn' } } }],
      metadata: { connectionId: 'test-conn' }
    };
    sandbox.stub(vscode.workspace, 'notebookDocuments').value([notebook]);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    const clientStub = {
      query: sandbox.stub().rejects(new Error('Query failed')),
      on: sandbox.stub()
    };
    connectionManagerStub.getConnection.resolves(clientStub);

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items).to.be.empty;
  });

  it('should return empty completions for simple provider when not matching', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[1];

    const document: any = {
      lineAt: () => ({ text: 'SELECT', substr: () => 'SELECT' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT'
    };
    const position: any = { character: 6 };

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items).to.be.empty;
  });

  it('should handle connection failure during completion', async () => {
    const providers: any[] = [];
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').callsFake((_selector, provider) => {
      providers.push(provider);
      return { dispose: sandbox.stub() };
    });

    new PostgresKernel(contextStub);
    const completionProvider = providers[0];

    const document: any = {
      lineAt: () => ({ text: 'FROM ', substr: () => 'FROM ' }),
      getWordRangeAtPosition: () => undefined,
      getText: () => 'SELECT * FROM '
    };
    const position: any = { character: 5 };

    const notebook = {
      getCells: () => [{ document: document, notebook: { metadata: { connectionId: 'test-conn' } } }],
      metadata: { connectionId: 'test-conn' }
    };
    sandbox.stub(vscode.workspace, 'notebookDocuments').value([notebook]);

    configGetStub.returns([{ id: 'test-conn', host: 'localhost', port: 5432, username: 'user' }]);

    connectionManagerStub.getConnection.rejects(new Error('Connection failed'));

    const items = await completionProvider.provideCompletionItems(document, position);
    expect(items).to.be.an('array');
    expect(items).to.be.empty;
  });
});
