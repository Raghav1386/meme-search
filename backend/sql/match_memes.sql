create extension if not exists vector;

create index if not exists memes_embedding_idx
on memes

using hnsw (embedding vector_cosine_ops);



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