require('dotenv').config();
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const twilioRoutes = require('./routes/twilio');
const vapiRoutes   = require('./routes/vapi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio routes — kept for SMS sending and legacy fallback
app.use('/twilio', twilioRoutes);

// Vapi routes — primary voice AI webhook handler
// Set VAPI_SERVER_URL=https://your-domain.com/vapi in .env
app.use('/vapi', vapiRoutes);

// Public config for the in-browser voice demo (only the PUBLIC key is exposed).
app.get('/api/config', (req, res) => {
  res.json({
    publicKey:   process.env.VAPI_PUBLIC_KEY   || '',
    assistantId: process.env.VAPI_ASSISTANT_ID || '',
  });
});

// Serve the demo website (homepage + static assets).
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
    }
  },
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
