-- Consolidate overlapping PERMISSIVE ALL policies on customers/orders into
-- explicit read policies (which may include thread-linked reads for the inbox)
-- and write policies (admin or assigned member only, same company).

-- CUSTOMERS
drop policy if exists "Owner scoped customers" on public.customers;

create policy "Owner scoped customers read"
on public.customers for select to authenticated
using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = customers.company_id
  )
  or exists (
    select 1 from communication_threads t
    where t.contact_id = customers.id
      and t.company_id = customers.company_id
      and (
        t.assigned_to in (
          select tm.id from team_members tm
          where tm.user_id = auth.uid() and tm.company_id = customers.company_id
        )
        or (t.channel_number is not null and t.channel_number in (
          select wc.phone_number
          from whatsapp_channels wc
          join team_members tm on tm.id = wc.team_member_id
          where tm.user_id = auth.uid()
            and wc.company_id = customers.company_id
            and tm.company_id = customers.company_id
        ))
      )
  )
);

create policy "Owner scoped customers insert"
on public.customers for insert to authenticated
with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = customers.company_id
  )
);

create policy "Owner scoped customers update"
on public.customers for update to authenticated
using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = customers.company_id
  )
)
with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = customers.company_id
  )
);

create policy "Owner scoped customers delete"
on public.customers for delete to authenticated
using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = customers.company_id
  )
);

-- ORDERS
drop policy if exists "Owner scoped orders" on public.orders;

create policy "Owner scoped orders read"
on public.orders for select to authenticated
using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = orders.company_id
  )
);

create policy "Owner scoped orders insert"
on public.orders for insert to authenticated
with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = orders.company_id
  )
);

create policy "Owner scoped orders update"
on public.orders for update to authenticated
using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = orders.company_id
  )
)
with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = orders.company_id
  )
);

create policy "Owner scoped orders delete"
on public.orders for delete to authenticated
using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_super_admin)
  or assigned_to in (
    select tm.id from team_members tm
    where tm.user_id = auth.uid() and tm.company_id = orders.company_id
  )
);