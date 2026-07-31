begin;

create extension if not exists pgtap;
select plan(8);

insert into public.licenses (
  id, key_hash, key_prefix, customer_name, plan, duration_days
) values (
  '00000000-0000-4000-8000-000000000010',
  'test-key-hash',
  'AU-TEST1',
  'Test customer',
  'pro',
  30
);

select is(
  (select result_status from public.activate_license('test-key-hash', 'machine-a')),
  'active',
  'first activation succeeds'
);

select is(
  (select result_status from public.activate_license('test-key-hash', 'machine-a')),
  'active',
  'same installation can check again'
);

select is(
  (select result_status from public.activate_license('test-key-hash', 'machine-b')),
  'already_activated',
  'second installation is rejected'
);

select ok(
  (public.admin_update_license(
    '00000000-0000-4000-8000-000000000010',
    'extend',
    30
  )).expires_at > now() + interval '59 days',
  'extension adds time to active license'
);

select is(
  (
    public.admin_update_license(
      '00000000-0000-4000-8000-000000000010',
      'revoke',
      null
    )
  ).status,
  'revoked',
  'admin can revoke a license'
);

select is(
  (
    public.admin_update_license(
      '00000000-0000-4000-8000-000000000010',
      'restore',
      null
    )
  ).status,
  'active',
  'admin can restore a valid license'
);

select is(
  (
    public.admin_update_license(
      '00000000-0000-4000-8000-000000000010',
      'reset-device',
      null
    )
  ).status,
  'unactivated',
  'device reset makes the key available again'
);

select is(
  (select result_status from public.activate_license('test-key-hash', 'machine-b')),
  'active',
  'reset key activates on a new installation'
);

select * from finish();
rollback;
