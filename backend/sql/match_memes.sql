create extension if not exists vector;

create table if not exists memes (
  id bigint generated always as identity primary key,
  b2_key text unique not null,
  caption text,
  ocr_text text,
  format text,
  embedding vector(512)
);

alter table memes add column if not exists ocr_text text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'memes' and column_name = 'fts'
  ) then
    alter table memes add column fts tsvector 
      generated always as (
        setweight(to_tsvector('english', coalesce(caption, '')), 'A') || 
        setweight(to_tsvector('english', coalesce(ocr_text, '')), 'B')
      ) stored;
  end if;
end $$;

create index if not exists memes_embedding_idx
on memes
using hnsw (embedding vector_cosine_ops);

create index if not exists memes_fts_idx
on memes
using gin (fts);

create or replace function match_memes (
  query_embedding vector(512),
  match_count int default 24
)
returns table (
  id bigint,
  b2_key text,
  caption text,
  format text,
  similarity float
)
language sql
as $$
  select
    id,
    b2_key,
    caption,
    format,
    1 - (embedding <=> query_embedding) as similarity
  from memes
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_memes_hybrid (
  query_text text,
  query_embedding vector(512) default null,
  match_count int default 12,
  filter_format text default null,
  rrf_k int default 60
)
returns table (
  id bigint,
  b2_key text,
  caption text,
  ocr_text text,
  format text,
  score float
)
language sql
as $$
  with vector_search as (
    select id, row_number() over (order by embedding <=> query_embedding) as rank
    from memes
    where query_embedding is not null
      and embedding is not null
      and (filter_format is null or filter_format = 'all' or format = filter_format)
    order by embedding <=> query_embedding
    limit 60
  ),
  text_search as (
    select id, row_number() over (order by ts_rank_cd(fts, websearch_to_tsquery('english', query_text)) desc) as rank
    from memes
    where query_text is not null
      and trim(query_text) <> ''
      and fts @@ websearch_to_tsquery('english', query_text)
      and (filter_format is null or filter_format = 'all' or format = filter_format)
    order by ts_rank_cd(fts, websearch_to_tsquery('english', query_text)) desc
    limit 60
  ),
  combined as (
    select
      coalesce(v.id, t.id) as id,
      (coalesce(1.0 / (rrf_k + v.rank), 0.0) + coalesce(1.0 / (rrf_k + t.rank), 0.0))::float as score
    from vector_search v
    full outer join text_search t on v.id = t.id
  )
  select
    m.id,
    m.b2_key,
    m.caption,
    m.ocr_text,
    m.format,
    c.score
  from combined c
  join memes m on m.id = c.id
  order by c.score desc
  limit match_count;
$$;
