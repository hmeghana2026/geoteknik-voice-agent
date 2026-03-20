/**
 * Database Initialization Script
 * Creates tables and initial schema
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/logger');

async function initializeDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    logger.info('Creating database...');

    // Create database
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'geoteknik_voice_agent'}`
    );

    // Switch to database
    await connection.query(`USE ${process.env.DB_NAME || 'geoteknik_voice_agent'}`);

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema statements
    const statements = schema.split(';').filter((s) => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    logger.info('✓ Database initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

initializeDatabase().catch(() => process.exit(1));