-- #113 part 2 — point each task-creation lifecycle row at the task's project.
--
-- activity_entries.project_id is captured at INSERT from the mutation payload,
-- so a task that got its project AFTER creation has a creation row with
-- project_id NULL, and one that MOVED has a row pointing at the old project.
-- Either way the row never reaches the feed of the project the task is in, which
-- is why the client-side synthetic row in ActivityStream had to exist.
--
-- 43 rows, enumerated explicitly rather than matched by predicate so this file
-- IS the record of what changed: 26 from NULL, 17 from another project.
-- Nick's call, 2026-08-18: the creation line follows the task. The move itself
-- is already narrated separately by a 'moved' lifecycle event.
--
-- Rollback: scripts/backfill-113b-align-project-id.rollback.sql (generated from
-- the pre-update state, same 43 ids).

UPDATE activity_entries SET project_id = 'proj_7F27APDE49WTC2GE4SKRMNYTAM' WHERE id = '033168b31f749b0674fdd340d4d19004';
UPDATE activity_entries SET project_id = 'proj_71HSNYQ92KH6KWFN2E0A6T93ZA' WHERE id = '03921bb33c14f56b1a97d1c447f3864e';
UPDATE activity_entries SET project_id = 'proj_30QFCKSC9GH2GFR8DXGMFNTDQE' WHERE id = '0b15fd3584782c4af70512227ada6677';
UPDATE activity_entries SET project_id = 'proj_7F27APDE49WTC2GE4SKRMNYTAM' WHERE id = '0d99d551ffb8c6e73da765f489010025';
UPDATE activity_entries SET project_id = 'proj_54D5KE89DP0NZDP32QJYC81N18' WHERE id = '0ef525187aac7962031443df383d217e';
UPDATE activity_entries SET project_id = 'proj_01KXZR2FW0SGV5PVQ8PM2YZAY2' WHERE id = '1aaa236a4199aa22fabb3b751ae35d15';
UPDATE activity_entries SET project_id = 'proj_01KXZR2FW0SGV5PVQ8PM2YZAY2' WHERE id = '222f65f79a8eedd391b11a4e5c91cf02';
UPDATE activity_entries SET project_id = 'proj_5AFX4KHTD3B9J7DF6G6EY7C00F' WHERE id = '4010bab65eb626b279d4c924c1203dd5';
UPDATE activity_entries SET project_id = 'proj_2YBMYG5J1750BZEK9MJPQSPKB5' WHERE id = '408961768a5823236062738f55b7df99';
UPDATE activity_entries SET project_id = 'proj_01KZ9ASQX53FJBYDPCCSQP8C86' WHERE id = '4116f77736f5f1755f38c00db2f0d9af';
UPDATE activity_entries SET project_id = 'proj_2YBMYG5J1750BZEK9MJPQSPKB5' WHERE id = '4712b74182fcc1753b85e28a732be957';
UPDATE activity_entries SET project_id = 'proj_61A9GZBGK3BJQRTCSKNVCY93WX' WHERE id = '475d50bb502a0581034767194ed39c87';
UPDATE activity_entries SET project_id = 'proj_54D5KE89DP0NZDP32QJYC81N18' WHERE id = '4a82d8025d17b689360cdf856e77418f';
UPDATE activity_entries SET project_id = 'proj_5AFX4KHTD3B9J7DF6G6EY7C00F' WHERE id = '4e22568efa64cf42ee99d35fe50be6d9';
UPDATE activity_entries SET project_id = 'proj_7F27APDE49WTC2GE4SKRMNYTAM' WHERE id = '5fcb7ae56f7173dc17b05635fea2f5ec';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = '7505e2b40146bf0badfd6d74e3e8e322';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = '76ef215e8811247959f3f0bd635ae2a5';
UPDATE activity_entries SET project_id = 'proj_01KYWSSJ61M1HDHR6WZDZM77PE' WHERE id = '7ae7eb0503455a4add053e5d16d4826d';
UPDATE activity_entries SET project_id = 'proj_3999V0Y09T81RRZ9DX7J0NWVX3' WHERE id = '7e97ac26ffe20687446e0f80a193d446';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = '82b80e97306009966ce7a922d4c79600';
UPDATE activity_entries SET project_id = 'proj_01KZ9ASQX53FJBYDPCCSQP8C86' WHERE id = '84d2c2d2d24f2fd363ab0c1d22818fe0';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = '87f3ed69100b919d6d0aa8e5f30f9764';
UPDATE activity_entries SET project_id = 'proj_01KYWQ306VC8N34NW23CM3H47H' WHERE id = '8a2d4998ccad2a79747d3cbd200f80ca';
UPDATE activity_entries SET project_id = 'proj_01M07V06HM537YVD2SK771SGKR' WHERE id = '8ef6efd0d81da076a0443ffa30e51f42';
UPDATE activity_entries SET project_id = 'proj_3999V0Y09T81RRZ9DX7J0NWVX3' WHERE id = '92d0222b016e3029c9fb3eac2c84ffa7';
UPDATE activity_entries SET project_id = 'proj_01KTP9ZBKWMVKK5260YZM54C84' WHERE id = '93331bef07ca043af13af0b1566624b7';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = '95bd52aad54e441bd937c37e3b335f39';
UPDATE activity_entries SET project_id = 'proj_54D5KE89DP0NZDP32QJYC81N18' WHERE id = '97cd3e2b61bd4b27b43dc646b21f2304';
UPDATE activity_entries SET project_id = 'proj_7F27APDE49WTC2GE4SKRMNYTAM' WHERE id = '98a4e6e69205be02416ed7c4bd1cd9d3';
UPDATE activity_entries SET project_id = 'proj_08Q9JGNWB7SBGMFDQPRSJBNQH6' WHERE id = '9cc4930617142f98e2d7eb43e3af9232';
UPDATE activity_entries SET project_id = 'proj_7F27APDE49WTC2GE4SKRMNYTAM' WHERE id = '9f4446370284a69fdf5cec6efbdea4b6';
UPDATE activity_entries SET project_id = 'proj_71HSNYQ92KH6KWFN2E0A6T93ZA' WHERE id = 'ad3b87d7832436ac8269337d645b4a45';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = 'bd6c66b988076caf53b96846e1482750';
UPDATE activity_entries SET project_id = 'proj_6B6C79FS7S3726R10T59R5V80B' WHERE id = 'bfc6fb3f598934024d51d6d9f95ef1da';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = 'd5243b5f30c9fb410fd670d4424b9240';
UPDATE activity_entries SET project_id = 'proj_5AFX4KHTD3B9J7DF6G6EY7C00F' WHERE id = 'd55703d9e80e906f2628738a7b05decf';
UPDATE activity_entries SET project_id = 'proj_7F27APDE49WTC2GE4SKRMNYTAM' WHERE id = 'd8f423844d50c2cbedbf64f91e2c51a7';
UPDATE activity_entries SET project_id = 'proj_2DFPT46Z9Z4S0ZA5PABCQS2AP1' WHERE id = 'dbc37ba51d99ffebcf5cb1f814289b95';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = 'f3162ca068cdb0bf2ca109d6bb25f9d4';
UPDATE activity_entries SET project_id = 'proj_01M08DJKWW7C34ZZF93MCJFG3S' WHERE id = 'f425f20d0c1b5b763ecf7743bbd95d52';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = 'f563d5fb5dc0085dda52a7966780c517';
UPDATE activity_entries SET project_id = 'proj_4BM9T7X29S9ASQ8P99C4R9R95F' WHERE id = 'fc64cec2ab86179aa89cd04c5e55bbb2';
UPDATE activity_entries SET project_id = 'proj_01KXZR2FW0SGV5PVQ8PM2YZAY2' WHERE id = 'fcdb712fc44a7684468eac80d718b331';
