import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { loadTemplate, loadCompleteTemplate, getNonce } from '../../lib/template-loader';

describe('TemplateLoader', () => {
  let sandbox: sinon.SinonSandbox;
  let readFileStub: sinon.SinonStub;
  let joinPathStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    readFileStub = sandbox.stub();

    // Mock vscode.workspace.fs
    const fsStub = {
      readFile: readFileStub,
      // Add other methods if needed
    };
    sandbox.stub(vscode.workspace, 'fs').value(fsStub);

    // Mock vscode.Uri.joinPath
    joinPathStub = sandbox.stub(vscode.Uri, 'joinPath').callsFake((base, ...segments) => {
      return { fsPath: [base.fsPath, ...segments].join('/') } as vscode.Uri;
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getNonce', () => {
    it('should return a 32-character string', () => {
      const nonce = getNonce();
      expect(nonce).to.be.a('string');
      expect(nonce).to.have.lengthOf(32);
    });

    it('should return unique values', () => {
      const nonce1 = getNonce();
      const nonce2 = getNonce();
      expect(nonce1).to.not.equal(nonce2);
    });
  });

  describe('loadTemplate', () => {
    const extensionUri = { fsPath: '/ext' } as vscode.Uri;

    it('should load simple HTML template', async () => {
      const htmlContent = '<div>Hello</div>';
      readFileStub.resolves(new TextEncoder().encode(htmlContent));

      const result = await loadTemplate(extensionUri, 'test', { folder: 'views' });

      expect(result).to.equal(htmlContent);
      expect(readFileStub.calledOnce).to.be.true;
      // Verify path construction: /ext/templates/views/test.html
      const uri = readFileStub.firstCall.args[0];
      expect(uri.fsPath).to.equal('/ext/templates/views/test.html');
    });

    it('should substitute variables', async () => {
      const htmlContent = '<div>{{message}}</div>';
      readFileStub.resolves(new TextEncoder().encode(htmlContent));

      const result = await loadTemplate(extensionUri, 'test', {
        folder: 'views',
        variables: { message: 'Hello World' }
      });

      expect(result).to.equal('<div>Hello World</div>');
    });

    it('should inject CSS', async () => {
      const htmlContent = '<html>{{STYLES}}<body></body></html>';
      const cssContent = 'body { color: red; }';

      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/test.html'))
        .resolves(new TextEncoder().encode(htmlContent));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/style.css'))
        .resolves(new TextEncoder().encode(cssContent));

      const result = await loadTemplate(extensionUri, 'test', {
        folder: 'views',
        cssFile: 'style.css'
      });

      expect(result).to.contain('<style>\nbody { color: red; }\n</style>');
    });

    it('should inject JS', async () => {
      const htmlContent = '<html><body>{{SCRIPTS}}</body></html>';
      const jsContent = 'console.log("hi");';

      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/test.html'))
        .resolves(new TextEncoder().encode(htmlContent));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/script.js'))
        .resolves(new TextEncoder().encode(jsContent));

      const result = await loadTemplate(extensionUri, 'test', {
        folder: 'views',
        jsFile: 'script.js'
      });

      expect(result).to.contain('<script>\nconsole.log("hi");\n</script>');
    });

    it('should clean up unused placeholders', async () => {
      const htmlContent = '{{STYLES}}<div>Content</div>{{SCRIPTS}}';
      readFileStub.resolves(new TextEncoder().encode(htmlContent));

      const result = await loadTemplate(extensionUri, 'test', { folder: 'views' });

      expect(result).to.equal('<div>Content</div>');
    });
  });
});
