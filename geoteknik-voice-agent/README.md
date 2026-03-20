# Geoteknik Voice Agent

An intelligent, context-aware voice agent for technical support that provides troubleshooting guidance, knowledge base integration, and graceful escalation to human agents.

## Features

✅ **Intelligent Silence Handling** - Adaptive timeouts based on conversation context
✅ **Coherent Problem-Solving** - Structured troubleshooting workflow
✅ **Session Persistence** - Maintains context across the entire call
✅ **Knowledge Integration** - Combines database manuals with website scraping
✅ **Smart Escalation** - Transfers to human agents with full context
✅ **Analytics & Logging** - Tracks resolution rates and identifies improvement areas

## Architecture

```
┌─────────────────┐
│  Inbound Call   │
└────────┬─────���──┘
         │
         ▼
   ┌──────────────────┐
   │  Session Manager │
   └────────┬─────────┘
            │
         ┌──┴──────────────────────┐
         │                         │
         ▼                         ▼
   ┌─────────────────┐    ┌──────────────────┐
   │  Voice Agent    │    │  Troubleshooting │
   │                 │    │     Engine       │
   └────────┬────────┘    └────────┬─────────┘
            │                      │
            └──────────┬───────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
         ▼                            ▼
   ┌─────────────────┐      ┌──────────────────┐
   │ Knowledge Base  │      │ Speech Service   │
   └────────┬────────┘      └──────────────────┘
            │
      ┌─────┴──────┐
      │            │
      ▼            ▼
   ┌──────┐   ┌─────────���┐
   │ DB   │   │ Scraper  │
   └──────┘   └──────────┘
```

## Quick Start

### Prerequisites

- Node.js >= 16.0.0
- MySQL >= 5.7
- Redis
- Twilio account

### Installation

```bash
# Clone repository
git clone https://github.com/hmeghana2026/geoteknik-voice-agent.git
cd geoteknik-voice-agent

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Initialize database
npm run db:init

# Seed with sample solutions (optional)
npm run db:seed

# Start server
npm start
```

### Development

```bash
npm run dev
```

## Configuration

All configuration is managed through environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `SILENCE_TIMEOUT_WELCOME` | Initial greeting timeout | 5000ms |
| `SILENCE_TIMEOUT_TROUBLESHOOTING` | During troubleshooting timeout | 10000ms |
| `SILENCE_TIMEOUT_QUESTION` | After question timeout | 8000ms |
| `MAX_SILENCE_RETRIES` | Max retries before escalation | 3 |
| `ENABLE_WEB_SCRAPING` | Enable website scraping | true |
| `LOG_LEVEL` | Logging level | info |

## API Endpoints

### Health Check
```bash
GET /health
```

### Incoming Call
```bash
POST /call/incoming
Body: {
  From: "+1234567890",
  CallSid: "CA1234567890abcdef",
  CustomerId: "cust_123"
}
```

### Get Session
```bash
GET /sessions/:sessionId
```

### List Active Sessions
```bash
GET /sessions
```

### Search Knowledge Base
```bash
POST /knowledge/search
Body: { "query": "device won't start" }
```

### Analytics
```bash
GET /analytics
```

## Database Schema

### Solutions Table
Stores solution articles with steps and prerequisites.

### Session Logs Table
Records all voice interactions for analytics.

### Escalations Table
Tracks transfers to human agents.

### Analytics Table
Aggregated performance metrics.

## Key Improvements Over Previous Version

### 1. Silence Handling ✅
**Before:** Agent hung up after 2 seconds
**After:** Adaptive timeouts (5-10 seconds) with intelligent retries

```javascript
// Adaptive timeout based on context
const timeout = contextType === 'initial' 
  ? 5000 
  : contextType === 'troubleshooting' 
  ? 10000 
  : 8000;
```

### 2. Coherent Problem-Solving ✅
**Before:** No structured approach
**After:** 5-step methodology

1. Clarify problem with multi-turn dialogue
2. Search knowledge base
3. Run diagnostics
4. Execute solution step-by-step
5. Verify resolution

### 3. Context Persistence ✅
**Before:** Lost context between sentences
**After:** Redis session store + conversation history

```javascript
// Every interaction stored
sessionManager.addMessage(sessionId, 'customer', response.text);
```

### 4. Knowledge Integration ✅
**Before:** No reference materials
**After:** DB-first with web scraping fallback

```javascript
// Priority 1: Database (fast)
// Priority 2: Website scraping (fallback)
```

### 5. Smart Escalation ✅
**Before:** No context passed to agents
**After:** Complete handoff data with full history

## Testing

```bash
# Run tests
npm test

# Test specific module
npm test src/core/sessionManager.js
```

## Logging

Logs are written to `logs/agent.log` with rotation:
- Max file size: 10MB
- Max files: 5
- Error logs: `logs/error.log`

View live logs:
```bash
tail -f logs/agent.log
```

## Monitoring

Monitor active sessions:
```bash
curl http://localhost:3000/sessions
```

View analytics:
```bash
curl http://localhost:3000/analytics
```

## Troubleshooting

### No response from agent
- Check Redis connection
- Verify MySQL connectivity
- Check logs: `tail -f logs/error.log`

### Knowledge base not finding solutions
- Ensure solutions are seeded: `npm run db:seed`
- Check web scraping is enabled: `ENABLE_WEB_SCRAPING=true`
- Try manual search: `POST /knowledge/search`

### Call drops unexpectedly
- Increase timeout values in `.env`
- Check network stability
- Review logs for errors

## Performance Optimization

- **Redis Caching:** Sessions cached for 1 hour
- **DB Query Optimization:** Full-text search on solutions
- **Web Scraping:** Cached for 24 hours
- **Connection Pooling:** 10 concurrent MySQL connections

## Future Enhancements

- [ ] Multi-language support
- [ ] Advanced NLU (entity extraction)
- [ ] Sentiment analysis
- [ ] Integration with CRM systems
- [ ] AI-powered solution generation
- [ ] Voice biometrics for authentication

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Submit pull request

## License

MIT

## Support

For issues and questions:
- Create GitHub issue
- Contact: support@geoteknik.com

---

**Built with ❤️ for Geoteknik Technical Support**