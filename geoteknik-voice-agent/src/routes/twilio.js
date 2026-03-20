const express = require('express');
const twilio = require('twilio');
const { searchManuals, saveCallHistory } = require('../services/supabase');
const { getAIResponse } = require('../services/ai');
const { getEmbedding } = require('../services/embeddings');

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// In-memory session store (fine for POC)
const sessions = new Map();

router.post('/incoming', async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const callerPhone = req.body.From;
  const speechResult = req.body.SpeechResult || '';

  let session = sessions.get(callSid) || { step: 'identify' };

  try {

    // ── STEP 1: Welcome any caller ────────────────────────────────────────
    if (session.step === 'identify') {
      session.step = 'select_product';
      sessions.set(callSid, session);

      const gather = twiml.gather({
        input: 'speech',
        action: '/twilio/incoming',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US'
      });
      gather.say(
        `Welcome to Geo-tek-nik support centre . ` +
        `Which product do you need help with today?`
      );
    }

    // ── STEP 2: Customer selects a product ───────────────────────────────
    else if (session.step === 'select_product') {
      session.product = speechResult;
      session.step = 'support';
      sessions.set(callSid, session);

      const gather = twiml.gather({
        input: 'speech',
        action: '/twilio/incoming',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US'
      });
      gather.say(
        `Got it, I'll help you with ${session.product}. ` +
        `What's your question?`
      );
    }

    // ── STEP 3: Answer the support question ──────────────────────────────
    else if (session.step === 'support') {
      const userQuery = speechResult;

      // Check if customer wants to end
      const endPhrases = ['no', 'that\'s all', 'goodbye', 'thank you bye', 'no thanks', 'done'];
      const wantsToEnd = endPhrases.some(phrase =>
        userQuery.toLowerCase().includes(phrase)
      );

      if (wantsToEnd) {
        twiml.say(
          `Thank you for contacting Geoteknik support. Have a great day!`
        );
        twiml.hangup();

        // Save call history
        await saveCallHistory({
          phone_number: callerPhone,
          product_queried: session.product,
          summary: `Customer asked about ${session.product}`
        });

        sessions.delete(callSid);

      } else {
        // Get embedding → search manuals → get AI answer
        const embedding = await getEmbedding(userQuery);
        const manualChunks = await searchManuals(embedding, session.product);
        const context = manualChunks?.map(c => c.content).join('\n\n') || '';

        const answer = await getAIResponse(userQuery, context, {
          currentProduct: session.product
        });

        const gather = twiml.gather({
          input: 'speech',
          action: '/twilio/incoming',
          method: 'POST',
          speechTimeout: 'auto',
          language: 'en-US'
        });
        gather.say(answer);
        gather.say('Do you have another question?');
      }
    }

  } catch (err) {
    console.error('Error handling call:', err);
    twiml.say('I\'m sorry, something went wrong. Please try again later.');
    twiml.hangup();
    sessions.delete(callSid);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

module.exports = router;