require('dotenv').config();
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

app.get('/', (req, res) => {
  res.send('Geoteknik Voice Agent is running.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});