
DROP POLICY IF EXISTS "Properties are publicly readable" ON public.properties;

-- No SELECT policy → blocked by RLS for clients. Server functions use service role.

CREATE OR REPLACE VIEW public.properties_public
WITH (security_invoker = on) AS
SELECT id, slug, name, country, coming_soon, created_at
FROM public.properties;

GRANT SELECT ON public.properties_public TO anon, authenticated;
