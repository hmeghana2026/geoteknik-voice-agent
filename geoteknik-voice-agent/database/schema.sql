-- Solutions and Manuals
CREATE TABLE IF NOT EXISTS solutions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  device_type VARCHAR(100),
  keywords TEXT,
  prerequisites TEXT,
  steps JSON,
  success_metrics JSON,
  difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_title (title),
  INDEX idx_category (category),
  INDEX idx_device (device_type),
  FULLTEXT idx_keywords (keywords)
);

-- Cached Web Solutions
CREATE TABLE IF NOT EXISTS cached_solutions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  query VARCHAR(255),
  title VARCHAR(255),
  content LONGTEXT,
  steps JSON,
  source VARCHAR(50),
  source_url VARCHAR(500),
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_query (query),
  INDEX idx_cached (cached_at)
);

-- Session Logs
CREATE TABLE IF NOT EXISTS session_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20),
  customer_id VARCHAR(100),
  call_id VARCHAR(100),
  start_time BIGINT,
  end_time BIGINT,
  duration INT,
  problem JSON,
  clarification JSON,
  diagnostics JSON,
  solution JSON,
  status VARCHAR(50),
  conversation_count INT DEFAULT 0,
  silence_count INT DEFAULT 0,
  satisfaction_score INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_created (created_at),
  INDEX idx_status (status)
);

-- Escalations
CREATE TABLE IF NOT EXISTS escalations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20),
  customer_id VARCHAR(100),
  handoff_data JSON,
  agent_id VARCHAR(100),
  status ENUM('pending', 'assigned', 'completed') DEFAULT 'pending',
  resolved_by VARCHAR(100),
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_status (status)
);

-- Interaction Analytics
CREATE TABLE IF NOT EXISTS interaction_analytics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(255),
  issue_category VARCHAR(100),
  resolution_status ENUM('resolved', 'escalated', 'failed', 'disconnected') DEFAULT 'pending',
  time_to_resolution INT,
  customer_satisfaction INT,
  steps_executed INT,
  diagnostics_run INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (resolution_status),
  INDEX idx_category (issue_category),
  INDEX idx_created (created_at)
);

-- Agent Performance
CREATE TABLE IF NOT EXISTS agent_performance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE,
  total_calls INT DEFAULT 0,
  resolved_calls INT DEFAULT 0,
  escalated_calls INT DEFAULT 0,
  failed_calls INT DEFAULT 0,
  avg_resolution_time INT,
  avg_satisfaction_score DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_date (date)
);