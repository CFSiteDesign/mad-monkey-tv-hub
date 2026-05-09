
-- Properties table
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  access_code TEXT NOT NULL,
  coming_soon BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Properties are publicly readable"
  ON public.properties FOR SELECT
  USING (true);

-- No write policies: all writes go through server functions using service role.

-- TV assets table
CREATE TABLE public.tv_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_slug TEXT NOT NULL REFERENCES public.properties(slug) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('gm', 'global_marketing')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tv_assets_property_order ON public.tv_assets(property_slug, display_order);

ALTER TABLE public.tv_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TV assets are publicly readable"
  ON public.tv_assets FOR SELECT
  USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('tv-content', 'tv-content', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "TV content is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tv-content');

-- Writes to storage handled via server functions using service role.
