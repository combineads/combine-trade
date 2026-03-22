-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create test database for integration tests
CREATE DATABASE combine_trade_test;

-- Enable pgvector in test database
\c combine_trade_test;
CREATE EXTENSION IF NOT EXISTS vector;
