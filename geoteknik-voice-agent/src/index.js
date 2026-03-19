require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilioRoutes = require('./routes/twilio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use('/twilio', twilioRoutes);

app.get('/', (req, res) => {
  res.send('Geoteknik Voice Agent is running.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});