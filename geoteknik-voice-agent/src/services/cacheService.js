/**
 * Redis Cache Service
 * Handles caching for sessions, KB queries, and responses
 * Enables real-time response delivery with ultra-low latency
 */

const redis = require('redis');
const logger = require('../utils/logger');

class CacheService {
  constructor(config = {}) {
    this.host = config.host || process.env.REDIS_HOST || 'localhost';
    this.port = config.port || process.env.REDIS_PORT || 6379;
    this.ttl = config.ttl || 3600; // 1 hour default
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      this.client = redis.createClient({
        host: this.host,
        port: this.port,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.warn('Redis connection refused');
            return new Error('Redis connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exceeded');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        },
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('✓ Redis connected');
        this.isConnected = true;
      });

      // Promisify Redis commands
      this.getAsync = this._promisify(this.client.get, this.client);
      this.setAsync = this._promisify(this.client.setex, this.client);
      this.delAsync = this._promisify(this.client.del, this.client);
      this.getMultipleAsync = this._promisify(
        this.client.mget,
        this.client
      );
      this.flushAsync = this._promisify(this.client.flushdb, this.client);

      // Wait for connection
      await new Promise((resolve) => {
        if (this.isConnected) {
          resolve();
        } else {
          this.client.on('ready', resolve);
        }
      });

      logger.info('✓ Cache service initialized');
      return true;
    } catch (error) {
      logger.error('Cache initialization failed:', error);
      return false;
    }
  }

  /**
   * Promisify callback-based Redis methods
   */
  _promisify(fn, context) {
    return function (...args) {
      return new Promise((resolve, reject) => {
        fn.apply(context, [
          ...args,
          (err, reply) => {
            if (err) reject(err);
            else resolve(reply);
          },
        ]);
      });
    };
  }

  /**
   * Get cached value
   */
  async get(key) {
    try {
      if (!this.isConnected) return null;
      const value = await this.getAsync(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key, value, ttl = this.ttl) {
    try {
      if (!this.isConnected) return false;
      await this.setAsync(ttl, key, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async delete(key) {
    try {
      if (!this.isConnected) return false;
      await this.delAsync(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get multiple values
   */
  async getMultiple(keys) {
    try {
      if (!this.isConnected) return {};
      const values = await this.getMultipleAsync(keys);
      const result = {};
      keys.forEach((key, idx) => {
        result[key] = values[idx] ? JSON.parse(values[idx]) : null;
      });
      return result;
    } catch (error) {
      logger.error('Cache getMultiple error:', error);
      return {};
    }
  }

  /**
   * Cache session data
   */
  async cacheSession(sessionId, sessionData, ttl = 3600) {
    const key = `session:${sessionId}`;
    return this.set(key, sessionData, ttl);
  }

  /**
   * Get cached session
   */
  async getCachedSession(sessionId) {
    const key = `session:${sessionId}`;
    return this.get(key);
  }

  /**
   * Cache KB search results
   */
  async cacheKBSearch(query, results, ttl = 86400) {
    // 24 hours for KB results
    const key = `kb:${this._hashQuery(query)}`;
    return this.set(key, results, ttl);
  }

  /**
   * Get cached KB results
   */
  async getCachedKBResults(query) {
    const key = `kb:${this._hashQuery(query)}`;
    return this.get(key);
  }

  /**
   * Cache AI responses
   */
  async cacheAIResponse(context, response, ttl = 3600) {
    const key = `ai:${this._hashQuery(context)}`;
    return this.set(key, response, ttl);
  }

  /**
   * Get cached AI response
   */
  async getCachedAIResponse(context) {
    const key = `ai:${this._hashQuery(context)}`;
    return this.get(key);
  }

  /**
   * Hash query for cache key
   */
  _hashQuery(query) {
    const crypto = require('crypto');
    return crypto
      .createHash('md5')
      .update(query)
      .digest('hex');
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    try {
      if (!this.isConnected) return false;
      await this.flushAsync();
      logger.info('Cache cleared');
      return true;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache stats (for monitoring)
   */
  async getStats() {
    try {
      if (!this.isConnected) return null;
      return new Promise((resolve) => {
        this.client.info('stats', (err, stats) => {
          if (err) resolve(null);
          else resolve(stats);
        });
      });
    } catch (error) {
      logger.error('Cache stats error:', error);
      return null;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    try {
      if (this.client && this.isConnected) {
        this.client.quit();
        logger.info('✓ Redis connection closed');
      }
    } catch (error) {
      logger.error('Error closing Redis:', error);
    }
  }
}

module.exports = CacheService;