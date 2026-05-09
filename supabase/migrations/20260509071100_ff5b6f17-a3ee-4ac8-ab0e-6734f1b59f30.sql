ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS image_duration_seconds integer NOT NULL DEFAULT 8;