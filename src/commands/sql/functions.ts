/**
 * SQL Templates for Function Operations
 */

export const FunctionSQL = {
  /**
   * Call function template - provides both SELECT and SELECT * FROM syntax
   */
  call: (schema: string, name: string, args: string) =>
    `-- Call function (returns single value)
SELECT ${schema}.${name}(${args ? '\n  -- Replace with actual values:\n  ' + args.split(',').join(',\n  ') : ''});

-- Call function (returns table/set - use for multi-row results)
SELECT * FROM ${schema}.${name}(${args ? '\n  -- Replace with actual values:\n  ' + args.split(',').join(',\n  ') : ''});`,

  /**
   * Function metadata query
   */
  metadata: (schema: string, name: string) =>
    `-- Get function details and metadata
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    l.lanname as language,
    CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        WHEN 'v' THEN 'VOLATILE'
    END as volatility,
    p.prosecdef as security_definer,
    p.proisstrict as strict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = '${schema}' AND p.proname = '${name}';`,

  /**
   * DROP FUNCTION with options
   */
  dropWithOptions: (schema: string, name: string, args: string) =>
    `-- Drop function (with dependencies)
-- DROP FUNCTION IF EXISTS ${schema}.${name}(${args}) CASCADE;

-- Drop function (without dependencies - will fail if referenced)
-- DROP FUNCTION IF EXISTS ${schema}.${name}(${args}) RESTRICT;`,

  /**
   * CREATE FUNCTION templates
   */
  create: {
    sqlFunction: (schema: string) =>
      `-- Create simple SQL function
CREATE OR REPLACE FUNCTION ${schema}.function_name(param1 integer, param2 text)
RETURNS text AS $$
    SELECT 'Result: ' || param2 || ' with value ' || param1::text;
$$ LANGUAGE sql IMMUTABLE;

-- Add comment
COMMENT ON FUNCTION ${schema}.function_name(integer, text) IS 'Function description';`,

    plpgsqlFunction: (schema: string) =>
      `-- Create PL/pgSQL function with variables and control flow
CREATE OR REPLACE FUNCTION ${schema}.calculate_total(order_id integer)
RETURNS numeric AS $$
DECLARE
    total_amount numeric := 0;
    item_record record;
BEGIN
    FOR item_record IN 
        SELECT price, quantity 
        FROM ${schema}.order_items 
        WHERE order_id = calculate_total.order_id
    LOOP
        total_amount := total_amount + (item_record.price * item_record.quantity);
    END LOOP;
    
    RETURN total_amount;
END;
$$ LANGUAGE plpgsql STABLE;`,

    tableFunction: (schema: string) =>
      `-- Function that returns a table (set of rows)
CREATE OR REPLACE FUNCTION ${schema}.get_user_orders(user_id integer)
RETURNS TABLE (
    order_id integer,
    order_date timestamp,
    total_amount numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.created_at,
        o.total_amount
    FROM ${schema}.orders o
    WHERE o.user_id = get_user_orders.user_id
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;`,

    securityDefiner: (schema: string) =>
      `-- Function that runs with owner's privileges (use carefully!)
CREATE OR REPLACE FUNCTION ${schema}.admin_delete_user(user_id integer)
RETURNS boolean AS $$
BEGIN
    -- This function runs with the privileges of the function owner
    DELETE FROM ${schema}.users WHERE id = user_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to specific roles only
-- GRANT EXECUTE ON FUNCTION ${schema}.admin_delete_user(integer) TO admin_role;`,

    triggerFunction: (schema: string) =>
      `-- Function for triggers (returns trigger type)
CREATE OR REPLACE FUNCTION ${schema}.update_modified_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to use this function
-- CREATE TRIGGER set_updated_at
--     BEFORE UPDATE ON ${schema}.table_name
--     FOR EACH ROW
--     EXECUTE FUNCTION ${schema}.update_modified_timestamp();`,

    aggregateFunction: (schema: string) =>
      `-- Custom aggregate function
CREATE OR REPLACE FUNCTION ${schema}.sum_state(state numeric, value numeric)
RETURNS numeric AS $$
BEGIN
    RETURN COALESCE(state, 0) + COALESCE(value, 0);
END;
$$ LANGUAGE plpgsql;

CREATE AGGREGATE ${schema}.safe_sum(numeric) (
    SFUNC = ${schema}.sum_state,
    STYPE = numeric,
    INITCOND = 0
);`
  }
};
