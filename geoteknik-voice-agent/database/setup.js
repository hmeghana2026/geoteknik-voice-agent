/**
 * Supabase Table Setup Script
 * Creates all required tables
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../src/utils/logger');

async function setupSupabase() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    logger.info('Setting up Supabase tables...');

    // Create solutions table
    const { error: solutionsError } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS solutions (
          id BIGSERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(100),
          device_type VARCHAR(100),
          keywords TEXT,
          prerequisites TEXT,
          steps JSONB,
          success_metrics JSONB,
          difficulty_level VARCHAR(20) DEFAULT 'medium',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT solutions_pkey PRIMARY KEY (id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_solutions_title ON solutions(title);
        CREATE INDEX IF NOT EXISTS idx_solutions_device ON solutions(device_type);
      `,
    });

    if (solutionsError && !solutionsError.message.includes('already exists')) {
      logger.warn('Solutions table:', solutionsError.message);
    }

    // Create session logs table
    const { error: logsError } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS session_logs (
          id BIGSERIAL PRIMARY KEY,
          session_id VARCHAR(255) UNIQUE NOT NULL,
          phone_number VARCHAR(20),
          customer_id VARCHAR(100),
          call_id VARCHAR(100),
          start_time BIGINT,
          end_time BIGINT,
          duration INT,
          problem JSONB,
          clarification JSONB,
          diagnostics JSONB,
          solution JSONB,
          status VARCHAR(50),
          conversation_count INT DEFAULT 0,
          silence_count INT DEFAULT 0,
          satisfaction_score INT,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_session_logs_customer ON session_logs(customer_id);
        CREATE INDEX IF NOT EXISTS idx_session_logs_created ON session_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_session_logs_status ON session_logs(status);
      `,
    });

    if (logsError && !logsError.message.includes('already exists')) {
      logger.warn('Session logs table:', logsError.message);
    }

    // Create escalations table
    const { error: escalationsError } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS escalations (
          id BIGSERIAL PRIMARY KEY,
          session_id VARCHAR(255) UNIQUE NOT NULL,
          phone_number VARCHAR(20),
          customer_id VARCHAR(100),
          handoff_data JSONB,
          agent_id VARCHAR(100),
          status VARCHAR(50) DEFAULT 'pending',
          resolved_by VARCHAR(100),
          resolution_notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          assigned_at TIMESTAMP,
          completed_at TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_escalations_customer ON escalations(customer_id);
        CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
      `,
    });

    if (escalationsError && !escalationsError.message.includes('already exists')) {
      logger.warn('Escalations table:', escalationsError.message);
    }

    // Create cached solutions table
    const { error: cachedError } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS cached_solutions (
          id BIGSERIAL PRIMARY KEY,
          query VARCHAR(255),
          title VARCHAR(255),
          content TEXT,
          steps JSONB,
          source VARCHAR(50),
          source_url VARCHAR(500),
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_cached_solutions_query ON cached_solutions(query);
        CREATE INDEX IF NOT EXISTS idx_cached_solutions_cached ON cached_solutions(cached_at);
      `,
    });

    if (cachedError && !cachedError.message.includes('already exists')) {
      logger.warn('Cached solutions table:', cachedError.message);
    }

    logger.info('✓ Supabase tables setup complete');
  } catch (error) {
    logger.error('Supabase setup failed:', error);
    throw error;
  }
}

setupSupabase().catch(() => process.exit(1));