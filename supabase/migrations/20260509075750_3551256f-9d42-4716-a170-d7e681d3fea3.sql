CREATE POLICY "Properties are publicly readable"
ON public.properties
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "TV content is publicly readable" ON storage.objects;

CREATE POLICY "TV content files are publicly readable by path"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'tv-content'
  AND owner IS NULL
  AND name IS NOT NULL
);