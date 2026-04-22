require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const path       = require('path');
const twilioRoutes = require('./routes/twilio');
const vapiRoutes   = require('./routes/vapi');
const demoRoutes   = require('./routes/demo');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve demo website
app.use(express.static(path.join(__dirname, '..', 'public')));

// Twilio routes — SMS sending and legacy fallback
app.use('/twilio', twilioRoutes);

// Vapi routes — primary voice AI webhook handler
app.use('/vapi', vapiRoutes);

// Demo config route — serves public key + assistant config to browser
app.use('/demo', demoRoutes);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Demo website: http://localhost:${PORT}`);
});