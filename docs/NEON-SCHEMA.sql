-- ClawRadar / Netlas 网关表结构（Neon Postgres）
-- 目标：节约请求、去重收敛、无效数据拦截、可追溯
-- 更新时间：2026-03-14

create extension if not exists pgcrypto;
drop table if exists netlas_quota_drift_events;
drop table if exists netlas_quota_calibrations;
drop table if exists netlas_snapshots;

-- 1) 密钥池
create table if not exists netlas_keys (
  id uuid primary key default gen_random_uuid(),
  key_id text not null unique,
  key_fingerprint text unique,
  api_key_ciphertext text not null,
  is_active boolean not null default true,
  daily_limit_requests integer,
  monthly_limit_requests integer,
  daily_limit_coins integer,
  monthly_limit_coins integer,
  rpm_limit integer,
  state text not null default 'healthy',
  cooldown_until timestamptz,
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_netlas_keys_state on netlas_keys (state);
create index if not exists idx_netlas_keys_active on netlas_keys (is_active);
create index if not exists idx_netlas_keys_cooldown on netlas_keys (cooldown_until);

-- 2) 同步任务
create table if not exists netlas_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null unique,
  run_type text not null,
  query text not null,
  query_hash text,
  base_url text not null,
  planned_targets integer not null default 0,
  processed_targets integer not null default 0,
  pages_fetched integer not null default 0,
  final_status text not null,
  summary jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_netlas_sync_jobs_started_at on netlas_sync_jobs (started_at desc);
create index if not exists idx_netlas_sync_jobs_status on netlas_sync_jobs (final_status);
alter table if exists netlas_sync_jobs drop column if exists total_hits;
alter table if exists netlas_sync_jobs drop column if exists deduped_hits;

-- 3) 请求级留痕
create table if not exists netlas_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  sync_job_id uuid references netlas_sync_jobs(id) on delete set null,
  key_id text references netlas_keys(key_id) on delete set null,
  endpoint text not null,
  query text,
  query_hash text,
  start_offset integer,
  page_size integer,
  status text not null,
  http_status integer,
  retry_after_seconds integer,
  error_code text,
  error_message text,
  duration_ms integer,
  request_headers jsonb,
  response_headers jsonb,
  response_body jsonb,
  response_body_text text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_netlas_requests_status on netlas_requests (status);
create index if not exists idx_netlas_requests_started_at on netlas_requests (started_at desc);
create index if not exists idx_netlas_requests_key_status on netlas_requests (key_id, status);
create index if not exists idx_netlas_requests_job on netlas_requests (sync_job_id);

-- 4) 资产明细（全局去重）
create table if not exists netlas_hits (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid references netlas_sync_jobs(id) on delete set null,
  request_id text references netlas_requests(request_id) on delete set null,
  key_id text references netlas_keys(key_id) on delete set null,
  provider text not null default 'netlas',
  query text,
  query_hash text,
  netlas_item_index integer,
  netlas_item_id text,
  hit_hash text,
  asset_key text,
  ip inet,
  port integer,
  transport text,
  protocol text,
  country text,
  country_code text,
  city text,
  latitude double precision,
  longitude double precision,
  observed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_hit jsonb not null,
  created_at timestamptz not null default now()
);

-- 历史兼容迁移（老表补列）
alter table if exists netlas_hits add column if not exists hit_hash text;
alter table if exists netlas_hits add column if not exists asset_key text;
alter table if exists netlas_hits add column if not exists first_seen_at timestamptz not null default now();
alter table if exists netlas_hits add column if not exists last_seen_at timestamptz not null default now();
alter table if exists netlas_hits drop column if exists seen_count;

create index if not exists idx_netlas_hits_ip on netlas_hits (ip);
create index if not exists idx_netlas_hits_port on netlas_hits (port);
create index if not exists idx_netlas_hits_job on netlas_hits (sync_job_id);
create index if not exists idx_netlas_hits_created_at on netlas_hits (created_at desc);
create index if not exists idx_netlas_hits_query_hash on netlas_hits (query_hash);
create index if not exists idx_netlas_hits_hash on netlas_hits (hit_hash);

-- 关键：全局唯一去重
create unique index if not exists uq_netlas_hits_hit_hash on netlas_hits (hit_hash) where hit_hash is not null;

-- 数据质量约束（允许现有脏数据先不校验，后续逐步清理）
alter table if exists netlas_hits drop constraint if exists chk_netlas_hits_port_valid;
alter table if exists netlas_hits add constraint chk_netlas_hits_port_valid check (port is null or (port >= 1 and port <= 65535)) not valid;
alter table if exists netlas_hits drop constraint if exists chk_netlas_hits_lat_valid;
alter table if exists netlas_hits add constraint chk_netlas_hits_lat_valid check (latitude is null or (latitude >= -90 and latitude <= 90)) not valid;
alter table if exists netlas_hits drop constraint if exists chk_netlas_hits_lon_valid;
alter table if exists netlas_hits add constraint chk_netlas_hits_lon_valid check (longitude is null or (longitude >= -180 and longitude <= 180)) not valid;

-- 5) 快照元数据
-- 6) 日额度账本
create table if not exists netlas_key_usage_daily (
  id uuid primary key default gen_random_uuid(),
  key_id text not null references netlas_keys(key_id) on delete cascade,
  usage_date date not null,
  used_requests integer not null default 0,
  used_coins integer not null default 0,
  unknown_pending integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (key_id, usage_date)
);

create index if not exists idx_usage_daily_date on netlas_key_usage_daily (usage_date);

-- 7) 月额度账本
create table if not exists netlas_key_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  key_id text not null references netlas_keys(key_id) on delete cascade,
  usage_month date not null,
  used_requests integer not null default 0,
  used_coins integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (key_id, usage_month)
);

create index if not exists idx_usage_monthly_month on netlas_key_usage_monthly (usage_month);

-- 8) 额度校准快照
-- 9) 额度漂移事件
-- 10) 通用字典表（配置与映射中心）
create table if not exists app_dictionary (
  id uuid primary key default gen_random_uuid(),
  dict_path text not null unique,
  namespace text not null,
  value_type text not null default 'string',
  value jsonb not null,
  description text,
  is_active boolean not null default true,
  updated_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists app_dictionary drop constraint if exists chk_app_dictionary_value_type;
alter table if exists app_dictionary
  add constraint chk_app_dictionary_value_type
  check (value_type in ('string', 'number', 'boolean', 'json'));

create index if not exists idx_app_dictionary_namespace_active on app_dictionary (namespace, is_active);
