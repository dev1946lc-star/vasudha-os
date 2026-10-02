-- 05_low_stock_threshold.sql

-- Add minimum stock threshold to products table for low stock alerts
ALTER TABLE public.products 
ADD COLUMN min_stock_level DECIMAL(10,2) DEFAULT 0;
