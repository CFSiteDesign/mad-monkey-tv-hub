UPDATE storage.buckets
SET
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'video/mp4', 'video/quicktime']::text[]
WHERE id = 'tv-content';