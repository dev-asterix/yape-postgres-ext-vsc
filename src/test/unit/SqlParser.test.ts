import { expect } from 'chai';
import { SqlParser } from '../../providers/kernel/SqlParser';

describe('SqlParser', () => {
  describe('splitSqlStatements', () => {
    it('should split simple statements', () => {
      const sql = 'SELECT 1; SELECT 2;';
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(2);
      expect(statements[0]).to.equal('SELECT 1;');
      expect(statements[1]).to.equal('SELECT 2;');
    });

    it('should ignore semicolons in single quotes', () => {
      const sql = "SELECT 'a;b'; SELECT 2;";
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(2);
      expect(statements[0]).to.equal("SELECT 'a;b';");
    });

    it('should handle escaped single quotes', () => {
      const sql = "SELECT 'O''Reilly'; SELECT 1;";
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(2);
      expect(statements[0]).to.equal("SELECT 'O''Reilly';");
    });

    it('should ignore semicolons in line comments', () => {
      const sql = 'SELECT 1; -- comment with ; inside \n SELECT 2;';
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(2);
      expect(statements[0]).to.equal('SELECT 1;');
      expect(statements[1]).to.contain('SELECT 2;');
    });

    it('should ignore semicolons in block comments', () => {
      const sql = 'SELECT 1; /* comment with ; \n inside */ SELECT 2;';
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(2);
      expect(statements[0]).to.equal('SELECT 1;');
      expect(statements[1]).to.contain('SELECT 2;');
    });

    it('should ignore semicolons in dollar-quoted strings', () => {
      const sql = 'CREATE FUNCTION foo() AS $$ BEGIN; RETURN; END; $$ LANGUAGE plpgsql; SELECT 1;';
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(2);
      expect(statements[0]).to.contain('$$ BEGIN; RETURN; END; $$');
    });

    it('should handle tagged dollar-quoted strings', () => {
      const sql = 'SELECT $tag$ ; $tag$; SELECT 2;';
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(2);
      expect(statements[0]).to.equal('SELECT $tag$ ; $tag$;');
    });

    it('should handle empty input', () => {
      const statements = SqlParser.splitSqlStatements('');
      expect(statements).to.be.empty;
    });

    it('should handle whitespace only', () => {
      const statements = SqlParser.splitSqlStatements('   \n   ');
      expect(statements).to.be.empty;
    });

    it('should handle nested complex structures', () => {
      const sql = `
                -- Start
                SELECT 1; 
                /* 
                   Multi-line comment ; 
                */
                SELECT 'text with ;' AS col;
                SELECT $tag$ 
                    nested ; string 
                $tag$;
            `;
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(3);
    });

    it('should handle comments without statements', () => {
      const sql = '-- just a comment';
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(1);
      expect(statements[0]).to.equal('-- just a comment');
    });

    it('should not split if no semicolon', () => {
      const sql = 'SELECT 1';
      const statements = SqlParser.splitSqlStatements(sql);
      expect(statements).to.have.lengthOf(1);
      expect(statements[0]).to.equal('SELECT 1');
    });
  });
});
