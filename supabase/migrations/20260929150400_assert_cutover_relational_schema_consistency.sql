-- Never allow a cutover registry to claim frozen relational operation unless
-- the declared table and its security-critical relational prerequisites exist.
do $$
declare
  v_entity text;
  v_table text;
  v_missing text[] := array[]::text[];
  v_required_column text;
  v_required_columns text[] := array[
    'organization_id',
    'legacy_record_id',
    'client_legacy_record_id',
    'bank_account_legacy_record_id',
    'cost_center_legacy_record_id',
    'category_legacy_record_id',
    'subcategory_id'
  ];
  v_constraint text;
  v_target_table text;
  v_local_columns text[];
  v_referenced_columns text[];
begin
  if to_regclass('public.legacy_cutover_registry') is null then
    return;
  end if;

  for v_entity, v_table in
    select entity, relational_table
    from public.legacy_cutover_registry
    where status = 'frozen'
      and write_mode = 'relational'
      and relational_table is not null
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      v_missing := array_append(v_missing, format('%s:table:%s', v_entity, v_table));
    end if;
  end loop;

  if exists (
    select 1 from public.legacy_cutover_registry
    where entity = 'FinancialEntry'
      and status = 'frozen'
      and write_mode = 'relational'
  ) then
    foreach v_table in array array[
      'maestro_bank_accounts',
      'maestro_financial_categories',
      'maestro_cost_centers'
    ] loop
      if to_regclass(format('public.%I', v_table)) is null then
        v_missing := array_append(v_missing, format('FinancialEntry:dimension_table:%s', v_table));
      end if;
    end loop;

    foreach v_required_column in array v_required_columns loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'maestro_financial_entries'
          and column_name = v_required_column
      ) then
        v_missing := array_append(v_missing, format('FinancialEntry:column:%s', v_required_column));
      end if;
    end loop;

    for v_constraint, v_target_table, v_local_columns, v_referenced_columns in
      select *
      from (values
        (
          'maestro_financial_entries_org_client_fk',
          'maestro_clients',
          array['organization_id', 'client_legacy_record_id']::text[],
          array['organization_id', 'legacy_record_id']::text[]
        ),
        (
          'maestro_financial_entries_org_bank_account_fk',
          'maestro_bank_accounts',
          array['organization_id', 'bank_account_legacy_record_id']::text[],
          array['organization_id', 'legacy_record_id']::text[]
        ),
        (
          'maestro_financial_entries_org_cost_center_fk',
          'maestro_cost_centers',
          array['organization_id', 'cost_center_legacy_record_id']::text[],
          array['organization_id', 'legacy_record_id']::text[]
        ),
        (
          'maestro_financial_entries_org_subcategory_parent_fk',
          'maestro_financial_categories',
          array['organization_id', 'subcategory_id', 'category']::text[],
          array['organization_id', 'legacy_record_id', 'parent_key']::text[]
        )
      ) as expected(constraint_name, target_table, local_columns, referenced_columns)
    loop
      if not exists (
        select 1 from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'maestro_financial_entries'
          and c.conname = v_constraint
          and c.contype = 'f'
          and c.convalidated
          and c.confrelid = to_regclass(format('public.%I', v_target_table))
          and array(
            select a.attname::text
            from unnest(c.conkey) with ordinality as key_column(attnum, ordinal)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key_column.attnum
            order by key_column.ordinal
          ) = v_local_columns
          and array(
            select a.attname::text
            from unnest(c.confkey) with ordinality as key_column(attnum, ordinal)
            join pg_attribute a on a.attrelid = c.confrelid and a.attnum = key_column.attnum
            order by key_column.ordinal
          ) = v_referenced_columns
      ) then
        v_missing := array_append(
          v_missing,
          format('FinancialEntry:validated_tenant_fk:%s->%s', v_constraint, v_target_table)
        );
      end if;
    end loop;
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'Relational cutover registry/schema mismatch: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;
