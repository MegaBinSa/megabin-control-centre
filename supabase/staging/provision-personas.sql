select app_private.provision_synthetic_staging_personas(
  'staging-office@megabin.local',
  'staging-driver@megabin.local',
  gen_random_uuid()
);

select app_private.provision_synthetic_staging_accounting_operator(
  'staging-accounting@megabin.local',
  gen_random_uuid()
);