# Contributing to PgStudio

Thank you for your interest in contributing to PgStudio! This guide will help you get started with development.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style Guide](#code-style-guide)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Commit Message Format](#commit-message-format)

---

## Development Setup

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **VS Code** >= 1.80.0
- **PostgreSQL** >= 12.x (for testing)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/dev-asterix/yape.git
cd yape

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. The extension will be loaded in a new VS Code window

### Project Scripts

```bash
npm run compile          # Compile TypeScript
npm run watch           # Watch mode (auto-compile on save)
npm run test            # Run unit tests
npm run lint            # Run ESLint
npm run esbuild-renderer # Bundle renderer for production
```

---

## Project Structure

```
yape/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── commands/                 # Command implementations
│   │   ├── connections.ts        # Connection management
│   │   ├── tables.ts             # Table operations
│   │   ├── views.ts              # View operations
│   │   ├── functions.ts          # Function operations
│   │   ├── fdw.ts                # Foreign Data Wrapper ops
│   │   ├── ai.ts                 # AI commands
│   │   └── helper.ts             # Shared utilities
│   ├── providers/                # VS Code providers
│   │   ├── DatabaseTreeProvider.ts
│   │   ├── SqlCompletionProvider.ts
│   │   ├── NotebookKernel.ts
│   │   └── DashboardPanel.ts
│   ├── services/                 # Core services
│   │   ├── ConnectionManager.ts  # Connection pooling
│   │   ├── SecretStorageService.ts
│   │   ├── SSHService.ts
│   │   ├── AIService.ts
│   │   ├── HistoryService.ts
│   │   ├── ErrorService.ts
│   │   └── DbObjectService.ts
│   ├── renderer_v2.ts            # Notebook renderer
│   ├── renderer/                 # Renderer modules
│   │   ├── components/ui.ts
│   │   └── features/
│   │       ├── export.ts
│   │       └── ai.ts
│   ├── common/                   # Shared types
│   │   └── types.ts
│   └── test/                     # Tests
│       └── unit/
├── docs/                         # Documentation
├── package.json                  # Extension manifest
└── tsconfig.json                 # TypeScript config
```

---

## Code Style Guide

### TypeScript Conventions

#### 1. **Strict Typing**
Always use explicit types. Avoid `any` unless absolutely necessary.

```typescript
// ✅ Good
async function getTableData(
  client: PoolClient,
  schema: string,
  table: string
): Promise<QueryResult> {
  return await client.query('SELECT * FROM $1.$2', [schema, table]);
}

// ❌ Bad
async function getTableData(client: any, schema: any, table: any): Promise<any> {
  return await client.query('SELECT * FROM $1.$2', [schema, table]);
}
```

#### 2. **Naming Conventions**

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `ConnectionManager` |
| Interfaces | PascalCase with `I` prefix (optional) | `ConnectionConfig` |
| Functions | camelCase | `getPooledClient` |
| Constants | UPPER_SNAKE_CASE | `MAX_ROWS` |
| Private members | camelCase with `_` prefix | `_pools` |

#### 3. **Async/Await**
Prefer `async/await` over `.then()` chains.

```typescript
// ✅ Good
async function fetchData() {
  try {
    const result = await client.query('SELECT ...');
    return result.rows;
  } catch (error) {
    ErrorService.getInstance().handleError(error);
  }
}

// ❌ Bad
function fetchData() {
  return client.query('SELECT ...')
    .then(result => result.rows)
    .catch(error => ErrorService.getInstance().handleError(error));
}
```

---

### Connection Management Best Practices

#### 1. **Always Use Pooling**

```typescript
// ✅ Good - Pooled client (auto-released)
const client = await ConnectionManager.getInstance().getPooledClient(config);
try {
  await client.query('SELECT ...');
} finally {
  client.release(); // CRITICAL: Always release in finally
}

// ❌ Bad - Direct client creation
const client = new Client(config);
await client.connect();
await client.query('SELECT ...');
await client.end(); // May not execute if error occurs
```

#### 2. **Session Clients for Notebooks**

```typescript
// ✅ Good - Session client for stateful operations
const client = await ConnectionManager.getInstance()
  .getSessionClient(config, notebook.uri.toString());

// Client persists across cells
// Automatically closed when notebook closes
```

#### 3. **Error Handling**

```typescript
// ✅ Good - Centralized error handling
try {
  await client.query('...');
} catch (error) {
  ErrorService.getInstance().handleError(error, {
    context: 'Table Operations',
    operation: 'INSERT',
    table: tableName
  });
  throw error; // Re-throw if caller needs to handle
}
```

---

### SQL Query Patterns

#### 1. **Parameterized Queries**
Always use parameterized queries to prevent SQL injection.

```typescript
// ✅ Good
await client.query(
  'SELECT * FROM $1.$2 WHERE id = $3',
  [schema, table, id]
);

// ❌ Bad - SQL injection risk
await client.query(
  `SELECT * FROM ${schema}.${table} WHERE id = ${id}`
);
```

#### 2. **Identifier Quoting**
Use double quotes for identifiers to handle special characters.

```typescript
// ✅ Good
const query = `SELECT * FROM "${schema}"."${table}"`;

// Handles schemas/tables with spaces, uppercase, etc.
```

---

### Error Handling Patterns

#### 1. **Service Layer Errors**

```typescript
export class MyService {
  private static instance: MyService;
  
  public static getInstance(): MyService {
    if (!MyService.instance) {
      MyService.instance = new MyService();
    }
    return MyService.instance;
  }
  
  async performOperation(): Promise<void> {
    try {
      // Operation logic
    } catch (error) {
      ErrorService.getInstance().handleError(error, {
        context: 'MyService',
        operation: 'performOperation'
      });
      throw error;
    }
  }
}
```

#### 2. **Command Handler Errors**

```typescript
export async function myCommandHandler(node: TreeNode) {
  try {
    const client = await ConnectionManager.getInstance()
      .getPooledClient(node.connection);
    try {
      await client.query('...');
      vscode.window.showInformationMessage('Success!');
    } finally {
      client.release();
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed: ${error.message}`);
  }
}
```

---

## Testing Guidelines

### Unit Tests

Located in `src/test/unit/`. Use Mocha + Chai.

```typescript
import { expect } from 'chai';
import * as sinon from 'sinon';

describe('ConnectionManager', () => {
  let sandbox: sinon.SinonSandbox;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  it('should create a new pool if one does not exist', async () => {
    const manager = ConnectionManager.getInstance();
    const config = { /* ... */ };
    
    const poolStub = {
      connect: sandbox.stub().resolves({ release: sandbox.stub() }),
      on: sandbox.stub(),
      end: sandbox.stub().resolves()
    };
    
    sandbox.stub(require('pg'), 'Pool').returns(poolStub);
    
    const client = await manager.getPooledClient(config);
    
    expect(poolStub.connect.calledOnce).to.be.true;
    expect(client).to.exist;
  });
});
```

### Integration Tests

Require a local PostgreSQL instance. Use environment variables for configuration:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=postgres
export PGDATABASE=test_db
```

---

## Pull Request Process

### 1. **Fork and Branch**

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/YOUR_USERNAME/yape.git

# Create a feature branch
git checkout -b feature/my-new-feature
```

### 2. **Make Changes**

- Follow the code style guide
- Add tests for new functionality
- Update documentation if needed

### 3. **Test Your Changes**

```bash
npm run compile
npm run test
npm run lint
```

### 4. **Commit**

Follow the [commit message format](#commit-message-format).

### 5. **Push and Create PR**

```bash
git push origin feature/my-new-feature
```

Then create a Pull Request on GitHub with:
- Clear description of changes
- Reference to related issues
- Screenshots/GIFs for UI changes

### 6. **Code Review**

- Address reviewer feedback
- Keep commits clean (squash if needed)
- Ensure CI passes

---

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(notebook): add infinite scrolling for large result sets

Implemented IntersectionObserver-based infinite scrolling to render
rows in chunks of 200. This prevents UI freezes when displaying
large result sets (up to 10k rows).

Closes #123
```

```
fix(connection): prevent connection leaks in table operations

Added try/finally blocks to ensure pooled clients are always released,
even when errors occur during query execution.

Fixes #456
```

```
docs(architecture): add system architecture documentation

Created ARCHITECTURE.md with Mermaid diagrams showing component
structure, data flow, and key design decisions.
```

---

## Code Review Checklist

Before submitting a PR, ensure:

- [ ] Code follows style guide
- [ ] All tests pass
- [ ] New functionality has tests
- [ ] Documentation updated
- [ ] No console.log() statements (use proper logging)
- [ ] Error handling implemented
- [ ] Connection resources properly released
- [ ] No `any` types (unless justified)
- [ ] Commit messages follow format

---

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/dev-asterix/yape/issues)
- **Discussions**: [GitHub Discussions](https://github.com/dev-asterix/yape/discussions)
- **Documentation**: [docs/](./docs/)

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).
