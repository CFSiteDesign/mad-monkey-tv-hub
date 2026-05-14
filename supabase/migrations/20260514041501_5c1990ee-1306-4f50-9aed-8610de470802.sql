
ALTER TABLE public.tv_assets
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

ALTER TABLE public.tv_assets
  ALTER COLUMN property_slug DROP NOT NULL;

ALTER TABLE public.tv_assets
  DROP CONSTRAINT IF EXISTS tv_assets_property_slug_fkey;

ALTER TABLE public.tv_assets
  ADD CONSTRAINT tv_assets_property_slug_fkey
  FOREIGN KEY (property_slug)
  REFERENCES public.properties(slug)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE public.tv_assets
  DROP CONSTRAINT IF EXISTS tv_assets_global_or_property_chk;

ALTER TABLE public.tv_assets
  ADD CONSTRAINT tv_assets_global_or_property_chk
  CHECK (
    (is_global = true AND property_slug IS NULL)
    OR (is_global = false AND property_slug IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS tv_assets_is_global_idx ON public.tv_assets(is_global);
