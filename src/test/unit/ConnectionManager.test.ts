import { expect } from 'chai';
import * as sinon from 'sinon';
import { ConnectionManager } from '../../services/ConnectionManager';
import { SecretStorageService } from '../../services/SecretStorageService';
import { Client } from 'pg';

describe('ConnectionManager', () => {
  let sandbox: sinon.SinonSandbox;
  let secretStorageStub: sinon.SinonStubbedInstance<SecretStorageService>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Mock SecretStorageService
    secretStorageStub = sandbox.createStubInstance(SecretStorageService);
    (SecretStorageService as any).instance = secretStorageStub;
    sandbox.stub(SecretStorageService, 'getInstance').returns(secretStorageStub as any);
  });

  afterEach(() => {
    sandbox.restore();
    // Reset singleton instance
    (ConnectionManager as any).instance = undefined;
  });

  it('should be a singleton', () => {
    const instance1 = ConnectionManager.getInstance();
    const instance2 = ConnectionManager.getInstance();
    expect(instance1).to.equal(instance2);
  });

  it('should create a new pool and client if one does not exist', async () => {
    const manager = ConnectionManager.getInstance();
    const config = {
      id: 'test-id',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'testdb',
      name: 'Test DB'
    };

    const poolClientStub = {
      release: sandbox.stub(),
      query: sandbox.stub()
    };

    const poolStub = {
      connect: sandbox.stub().resolves(poolClientStub),
      on: sandbox.stub(),
      end: sandbox.stub().resolves()
    };

    // Mock pg.Pool constructor
    const pgPoolStub = sandbox.stub(require('pg'), 'Pool').returns(poolStub);

    const client = await manager.getPooledClient(config);

    expect(pgPoolStub.calledOnce).to.be.true;
    expect(poolStub.connect.calledOnce).to.be.true;
    expect(client).to.equal(poolClientStub);
  });

  it('should reuse existing pool', async () => {
    const manager = ConnectionManager.getInstance();
    const config = {
      id: 'test-id',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'testdb',
      name: 'Test DB'
    };

    const poolClientStub = {
      release: sandbox.stub(),
      query: sandbox.stub()
    };

    const poolStub = {
      connect: sandbox.stub().resolves(poolClientStub),
      on: sandbox.stub(),
      end: sandbox.stub().resolves()
    };

    const pgPoolStub = sandbox.stub(require('pg'), 'Pool').returns(poolStub);

    await manager.getPooledClient(config);
    await manager.getPooledClient(config);

    // Pool constructor should only be called once
    expect(pgPoolStub.calledOnce).to.be.true;
    // Connect should be called twice (once for each request)
    expect(poolStub.connect.calledTwice).to.be.true;
  });

  it('should close connection (pool)', async () => {
    const manager = ConnectionManager.getInstance();
    const config = {
      id: 'test-id',
      host: 'localhost',
      port: 5432,
      username: 'user',
      database: 'testdb',
      name: 'Test DB'
    };

    const poolStub = {
      connect: sandbox.stub().resolves({ release: sandbox.stub() }),
      on: sandbox.stub(),
      end: sandbox.stub().resolves()
    };

    sandbox.stub(require('pg'), 'Pool').returns(poolStub);

    await manager.getPooledClient(config);
    await manager.closeConnection(config);

    expect(poolStub.end.calledOnce).to.be.true;
  });

  it('should close all connections', async () => {
    const manager = ConnectionManager.getInstance();
    const config1 = { id: '1', host: 'h', port: 1, username: 'u', database: 'd1', name: 'n' };
    const config2 = { id: '2', host: 'h', port: 1, username: 'u', database: 'd2', name: 'n' };

    const poolStub1 = { connect: sandbox.stub().resolves({ release: sandbox.stub() }), on: sandbox.stub(), end: sandbox.stub().resolves() };
    const poolStub2 = { connect: sandbox.stub().resolves({ release: sandbox.stub() }), on: sandbox.stub(), end: sandbox.stub().resolves() };

    const pgPoolStub = sandbox.stub(require('pg'), 'Pool');
    pgPoolStub.onCall(0).returns(poolStub1);
    pgPoolStub.onCall(1).returns(poolStub2);

    await manager.getPooledClient(config1);
    await manager.getPooledClient(config2);
    await manager.closeAll();

    expect(poolStub1.end.calledOnce).to.be.true;
    expect(poolStub2.end.calledOnce).to.be.true;
  });
});
