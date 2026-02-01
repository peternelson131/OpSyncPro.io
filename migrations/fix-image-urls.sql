-- Fix broken image URLs in database
-- 1. Fix images.keepa.com domain (doesn't exist)
-- 2. Fix double .jpg extensions

-- Fix sourced_products with broken Keepa URLs
UPDATE sourced_products
SET image_url = NULL
WHERE image_url LIKE '%images.keepa.com%';

-- Fix sourced_products with double extensions
UPDATE sourced_products
SET image_url = REPLACE(image_url, '.jpg._SL', '._SL')
WHERE image_url LIKE '%.jpg._SL%';

-- Fix catalog_imports with broken Keepa URLs
UPDATE catalog_imports
SET image_url = NULL
WHERE image_url LIKE '%images.keepa.com%';

-- Fix catalog_imports with double extensions
UPDATE catalog_imports
SET image_url = REPLACE(image_url, '.jpg._SL', '._SL')
WHERE image_url LIKE '%.jpg._SL%';

-- Mark fixed entries for re-enrichment (if they have no image)
UPDATE catalog_imports
SET enrichment_status = 'pending'
WHERE image_url IS NULL
AND enrichment_status = 'enriched';
