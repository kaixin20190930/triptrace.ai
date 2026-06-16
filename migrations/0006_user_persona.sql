-- Add persona_json to users table for storing User Persona Core profile
ALTER TABLE users ADD COLUMN persona_json TEXT;
