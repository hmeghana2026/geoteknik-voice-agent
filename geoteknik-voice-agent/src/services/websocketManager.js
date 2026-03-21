/**
 * WebSocket Manager
 * Enables real-time bidirectional communication for streaming responses
 */

const logger = require('../utils/logger');

class WebSocketManager {
  constructor() {
    this.connections = new Map();
    this.messageHandlers = new Map();
  }

  /**
   * Register WebSocket connection for a session
   */
  registerSession(sessionId, ws) {
    this.connections.set(sessionId, ws);
    logger.debug(`WebSocket registered for session ${sessionId}`);

    ws.on('close', () => {
      this.connections.delete(sessionId);
      logger.debug(`WebSocket closed for session ${sessionId}`);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for session ${sessionId}:`, error);
      this.connections.delete(sessionId);
    });
  }

  /**
   * Send message to session
   */
  sendToSession(sessionId, type, data) {
    const ws = this.connections.get(sessionId);
    if (ws && ws.readyState === 1) {
      // WebSocket.OPEN
      try {
        ws.send(
          JSON.stringify({
            type,
            data,
            timestamp: Date.now(),
          })
        );
        return true;
      } catch (error) {
        logger.error(
          `Failed to send message to session ${sessionId}:`,
          error
        );
        return false;
      }
    }
    return false;
  }

  /**
   * Stream partial response chunks to client (for AI responses)
   */
  async streamResponse(sessionId, chunks) {
    const ws = this.connections.get(sessionId);
    if (!ws || ws.readyState !== 1) {
      logger.warn(`No active WebSocket for session ${sessionId}`);
      return;
    }

    for (const chunk of chunks) {
      try {
        ws.send(
          JSON.stringify({
            type: 'response_chunk',
            data: chunk,
            timestamp: Date.now(),
          })
        );
        // Small delay between chunks for realistic streaming
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch (error) {
        logger.error(`Error streaming chunk to ${sessionId}:`, error);
        break;
      }
    }
  }

  /**
   * Broadcast message to all connected sessions
   */
  broadcast(type, data) {
    let sent = 0;
    this.connections.forEach((ws, sessionId) => {
      if (ws.readyState === 1) {
        try {
          ws.send(
            JSON.stringify({
              type,
              data,
              timestamp: Date.now(),
            })
          );
          sent++;
        } catch (error) {
          logger.error(`Failed to broadcast to ${sessionId}:`, error);
        }
      }
    });
    return sent;
  }

  /**
   * Register message handler for session
   */
  onMessage(sessionId, handler) {
    this.messageHandlers.set(sessionId, handler);
  }

  /**
   * Get connection status
   */
  isConnected(sessionId) {
    const ws = this.connections.get(sessionId);
    return ws && ws.readyState === 1;
  }

  /**
   * Get active connection count
   */
  getActiveConnections() {
    return this.connections.size;
  }

  /**
   * Close connection for session
   */
  closeSession(sessionId) {
    const ws = this.connections.get(sessionId);
    if (ws) {
      ws.close();
      this.connections.delete(sessionId);
      logger.debug(`WebSocket closed for session ${sessionId}`);
    }
  }

  /**
   * Close all connections
   */
  closeAll() {
    this.connections.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.close();
      }
    });
    this.connections.clear();
    logger.info('All WebSocket connections closed');
  }
}

module.exports = new WebSocketManager();