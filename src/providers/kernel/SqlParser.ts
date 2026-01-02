
/**
 * Service for parsing and analyzing SQL statements
 */
export class SqlParser {
  /**
   * Split SQL text into individual statements, respecting semicolons but ignoring them inside:
   * - String literals (single quotes)
   * - Dollar-quoted strings ($$...$$, $tag$...$tag$)
   * - Comments (-- and /* ... *\/)
   */
  public static splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let i = 0;
    let inSingleQuote = false;
    let inDollarQuote = false;
    let dollarQuoteTag = '';
    let inBlockComment = false;

    while (i < sql.length) {
      const char = sql[i];
      const nextChar = i + 1 < sql.length ? sql[i + 1] : '';
      const peek = sql.substring(i, i + 10);

      // Handle block comments /* ... */
      if (!inSingleQuote && !inDollarQuote && char === '/' && nextChar === '*') {
        inBlockComment = true;
        currentStatement += char + nextChar;
        i += 2;
        continue;
      }

      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        currentStatement += char + nextChar;
        i += 2;
        continue;
      }

      // Handle line comments -- ...
      if (!inSingleQuote && !inDollarQuote && !inBlockComment && char === '-' && nextChar === '-') {
        // Add rest of line to current statement
        const lineEnd = sql.indexOf('\n', i);
        if (lineEnd === -1) {
          currentStatement += sql.substring(i);
          break;
        }
        currentStatement += sql.substring(i, lineEnd + 1);
        i = lineEnd + 1;
        continue;
      }

      // Handle dollar-quoted strings
      if (!inSingleQuote && !inBlockComment) {
        const dollarMatch = peek.match(/^(\$[a-zA-Z0-9_]*\$)/);
        if (dollarMatch) {
          const tag = dollarMatch[1];
          if (!inDollarQuote) {
            inDollarQuote = true;
            dollarQuoteTag = tag;
            currentStatement += tag;
            i += tag.length;
            continue;
          } else if (tag === dollarQuoteTag) {
            inDollarQuote = false;
            dollarQuoteTag = '';
            currentStatement += tag;
            i += tag.length;
            continue;
          }
        }
      }

      // Handle single-quoted strings
      if (!inDollarQuote && !inBlockComment && char === "'") {
        if (inSingleQuote && nextChar === "'") {
          // Escaped quote ''
          currentStatement += "''";
          i += 2;
          continue;
        }
        inSingleQuote = !inSingleQuote;
      }

      // Handle semicolon as statement separator
      if (!inSingleQuote && !inDollarQuote && !inBlockComment && char === ';') {
        currentStatement += char;
        const trimmed = currentStatement.trim();
        if (trimmed) {
          statements.push(trimmed);
        }
        currentStatement = '';
        i++;
        continue;
      }

      currentStatement += char;
      i++;
    }

    // Add remaining statement if any
    const trimmed = currentStatement.trim();
    if (trimmed) {
      statements.push(trimmed);
    }

    return statements.filter(s => s.length > 0);
  }
}
