/**
 * Database Configuration for Supabase (PostgreSQL)
 * Supabase is a PostgreSQL-based backend-as-a-service
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.supabase = null;
    this.pool = null;
  }

  /**
   * Initialize Supabase client
   */
  async initializeSupabase() {
    try {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY are required in .env');
      }

      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
      );

      // Test connection by querying tables
      const { data, error } = await this.supabase
        .from('solutions')
        .select('count', { count: 'exact', head: true });

      if (error) {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }

      logger.info('✓ Supabase connected successfully');
      return this.supabase;
    } catch (error) {
      logger.error('Supabase initialization failed:', error);
      throw error;
    }
  }

  /**
   * Execute query via Supabase
   */
  async query(table, operation = 'select', data = {}) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      let query = this.supabase.from(table);

      switch (operation) {
        case 'select':
          query = query.select(data.select || '*');
          if (data.where) {
            Object.keys(data.where).forEach((key) => {
              query = query.eq(key, data.where[key]);
            });
          }
          if (data.limit) {
            query = query.limit(data.limit);
          }
          break;

        case 'insert':
          query = query.insert(data.values);
          break;

        case 'update':
          query = query.update(data.values);
          if (data.where) {
            Object.keys(data.where).forEach((key) => {
              query = query.eq(key, data.where[key]);
            });
          }
          break;

        case 'delete':
          query = query.delete();
          if (data.where) {
            Object.keys(data.where).forEach((key) => {
              query = query.eq(key, data.where[key]);
            });
          }
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const { data: result, error } = await query;

      if (error) {
        throw error;
      }

      return result;
    } catch (error) {
      logger.error(`Database ${operation} error:`, error);
      throw error;
    }
  }

  /**
   * Insert or update solution
   */
  async upsertSolution(solution) {
    try {
      const { data, error } = await this.supabase
        .from('solutions')
        .upsert([solution], { onConflict: 'id' });

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Upsert solution failed:', error);
      throw error;
    }
  }

  /**
   * Search solutions
   */
  async searchSolutions(query) {
    try {
      const { data, error } = await this.supabase
        .from('solutions')
        .select('*')
        .or(
          `title.ilike.%${query}%,keywords.ilike.%${query}%,category.ilike.%${query}%`
        )
        .limit(5);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Search solutions failed:', error);
      throw error;
    }
  }

  /**
   * Insert session log
   */
  async insertSessionLog(sessionData) {
    try {
      const { data, error } = await this.supabase
        .from('session_logs')
        .insert([sessionData]);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Insert session log failed:', error);
      throw error;
    }
  }

  /**
   * Get session logs for analytics
   */
  async getSessionAnalytics(hours = 24) {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabase
        .from('session_logs')
        .select('*')
        .gte('created_at', since);

      if (error) throw error;

      // Calculate analytics
      const analytics = {
        total_sessions: data.length,
        resolved: data.filter((s) => s.status === 'resolved').length,
        escalated: data.filter((s) => s.status === 'escalated').length,
        failed: data.filter((s) => s.status === 'failed').length,
        avg_duration: Math.round(
          data.reduce((sum, s) => sum + (s.duration || 0), 0) / data.length
        ),
        avg_satisfaction: (
          data.reduce((sum, s) => sum + (s.satisfaction_score || 0), 0) / data.length
        ).toFixed(2),
      };

      return analytics;
    } catch (error) {
      logger.error('Get analytics failed:', error);
      throw error;
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.supabase) {
      logger.info('✓ Supabase connection closed');
    }
  }
}

module.exports = new Database();