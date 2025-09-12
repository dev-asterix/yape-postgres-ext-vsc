const sinon = require('sinon');

const vscode = {
  workspace: {
    getConfiguration: () => ({
      get: () => [],
      update: () => Promise.resolve(),
    }),
  },
  secrets: {
    store: sinon.stub(),
    get: sinon.stub(),
    delete: sinon.stub(),
  },
  Uri: {
    parse: () => ({})
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  }
};

module.exports = vscode;
