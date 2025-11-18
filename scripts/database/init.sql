-- Database Initialization Script
-- This script runs when the PostgreSQL container is first created

-- Create test database
CREATE DATABASE dca_auth_test;

-- Enable extensions (if needed)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE dca_auth TO postgres;
GRANT ALL PRIVILEGES ON DATABASE dca_auth_test TO postgres;
