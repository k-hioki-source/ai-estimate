create table public.estimate_reviews (
  id uuid primary key,
  rating smallint not null check (rating between 1 and 5),
  style text not null check (style in ('line', 'color', 'real')),
  quantity integer not null check (quantity > 0),
  unit_hours numeric,
  amount integer check (amount >= 0),
  price_type text not null check (price_type in ('estimate', 'reference', 'consultation')),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  admin_comment text not null default '' check (char_length(admin_comment) <= 1000),
  consent_version integer not null check (consent_version = 1),
  created_at timestamptz not null default now(),
  image_base64 text not null check (char_length(image_base64) between 1 and 1400000)
);

alter table public.estimate_reviews enable row level security;
revoke all on public.estimate_reviews from public, anon, authenticated;
grant select, insert, update on public.estimate_reviews to service_role;

create index estimate_reviews_public_order on public.estimate_reviews (created_at desc, id desc)
  where status = 'published';
