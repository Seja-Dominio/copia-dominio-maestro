insert into public.organization_products (organization_id, product_key, status, plan_key, limits)
select o.id, p.product_key, 'enabled', 'internal', '{}'::jsonb
from public.organizations o
cross join (values ('maestro'), ('cxm'), ('ads_brain'), ('insights')) as p(product_key)
where o.slug = 'dominio-performance'
on conflict (organization_id, product_key) do update
set status = 'enabled',
    plan_key = 'internal',
    updated_at = now();
