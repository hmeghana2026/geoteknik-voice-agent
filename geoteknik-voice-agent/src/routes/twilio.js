const express = require('express');
const twilio = require('twilio');
const { searchManuals, saveCallHistory } = require('../services/supabase');
const { getAIResponse } = require('../services/ai');
const { getEmbedding } = require('../services/embeddings');

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// In-memory session store
const sessions = new Map();

router.post('/incoming', async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const callerPhone = req.body.From;
  const speechResult = (req.body.SpeechResult || '').trim();

  console.log(`[${callSid}] Step: ${sessions.get(callSid)?.step || 'NEW'} | Speech: "${speechResult}"`);

  let session = sessions.get(callSid) || { step: 'identify', history: [] };

  try {

    // ── STEP 1: Welcome & ask which product ──────────────────────────────
    if (session.step === 'identify') {
      session.step = 'select_product';
      sessions.set(callSid, session);

      const gather = twiml.gather({
        input: 'speech',
        action: '/twilio/incoming',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US',
        timeout: 10,
      });
      gather.say(
        { voice: 'Polly.Joanna' },
        'Welcome to Geoteknik support. Which product do you need help with today? ' +
        'For example, you can say drones, GPS, or surveying equipment.'
      );
      // Fallback if no speech detected
      twiml.redirect('/twilio/incoming');
    }

    // ── STEP 2: Capture product, ask what their question is ──────────────
    else if (session.step === 'select_product') {

      if (!speechResult) {
        // Reprompt if no speech detected
        const gather = twiml.gather({
          input: 'speech',
          action: '/twilio/incoming',
          method: 'POST',
          speechTimeout: 'auto',
          language: 'en-US',
          timeout: 10,
        });
        gather.say(
          { voice: 'Polly.Joanna' },
          "I didn't catch that. Which product do you need help with?"
        );
        twiml.redirect('/twilio/incoming');

      } else {
        session.product = speechResult;
        session.step = 'get_question';
        sessions.set(callSid, session);

        const gather = twiml.gather({
          input: 'speech',
          action: '/twilio/incoming',
          method: 'POST',
          speechTimeout: 'auto',
          language: 'en-US',
          timeout: 15,
        });
        gather.say(
          { voice: 'Polly.Joanna' },
          `Got it — ${session.product}. What is the issue or question you have?`
        );
        twiml.redirect('/twilio/incoming');
      }
    }

    // ── STEP 3: Get their actual question ────────────────────────────────
    else if (session.step === 'get_question') {

      if (!speechResult) {
        const gather = twiml.gather({
          input: 'speech',
          action: '/twilio/incoming',
          method: 'POST',
          speechTimeout: 'auto',
          language: 'en-US',
          timeout: 15,
        });
        gather.say(
          { voice: 'Polly.Joanna' },
          "I didn't catch that. Please describe your issue."
        );
        twiml.redirect('/twilio/incoming');

      } else {
        session.currentQuestion = speechResult;
        session.step = 'support';
        sessions.set(callSid, session);

        // Immediately process the question
        await handleSupportQuestion(twiml, session, callSid, callerPhone, speechResult);
      }
    }

    // ── STEP 4: Ongoing support Q&A ──────────────────────────────────────
    else if (session.step === 'support') {

      const endPhrases = ['no', "that's all", 'goodbye', 'thank you bye',
                          'no thanks', 'done', 'no more', 'all good', 'bye'];
      const wantsToEnd = !speechResult ||
        endPhrases.some(phrase => speechResult.toLowerCase().includes(phrase));

      if (wantsToEnd) {
        twiml.say(
          { voice: 'Polly.Joanna' },
          'Thank you for contacting Geoteknik support. Have a great day!'
        );
        twiml.hangup();

        await saveCallHistory({
          phone_number: callerPhone,
          product_queried: session.product,
          summary: `Customer asked about ${session.product}. Questions: ${session.history?.length || 0}`
        }).catch(e => console.error('saveCallHistory error:', e));

        sessions.delete(callSid);

      } else {
        await handleSupportQuestion(twiml, session, callSid, callerPhone, speechResult);
      }
    }

  } catch (err) {
    console.error(`[${callSid}] Fatal error:`, err);
    twiml.say(
      { voice: 'Polly.Joanna' },
      "I'm sorry, something went wrong on our end. Please call back and we'll try again."
    );
    twiml.hangup();
    sessions.delete(callSid);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});


/**
 * Core logic: embed query → search manuals → get AI answer → respond
 */
async function handleSupportQuestion(twiml, session, callSid, callerPhone, userQuery) {

  console.log(`[${callSid}] Answering: "${userQuery}" for product: "${session.product}"`);

  let answer;

  try {
    // 1. Get embedding for the user's query
    const embedding = await getEmbedding(userQuery);

    // 2. Search manuals in Supabase using vector similarity
    const manualChunks = await searchManuals(embedding, session.product);
    const context = manualChunks?.map(c => c.content).join('\n\n') || '';

    console.log(`[${callSid}] Manual chunks found: ${manualChunks?.length || 0}`);

    // 3. Get AI answer grounded in manual context
    answer = await getAIResponse(userQuery, context, {
      currentProduct: session.product
    });

  } catch (err) {
    console.error(`[${callSid}] AI/search error:`, err);
    // Graceful fallback — don't hang up, give a useful response
    answer = `I had trouble searching the manuals right now, but I can try to help. ` +
             `For ${session.product} issues, please check the product manual or ` +
             `I can connect you with a specialist. Would you like me to do that?`;
  }

  // 4. Store in session history
  if (!session.history) session.history = [];
  session.history.push({ q: userQuery, a: answer });
  sessions.set(callSid, session);

  // 5. Respond and ask if they have more questions
  const gather = twiml.gather({
    input: 'speech',
    action: '/twilio/incoming',
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US',
    timeout: 12,
  });
  gather.say({ voice: 'Polly.Joanna' }, answer);
  gather.say({ voice: 'Polly.Joanna' }, 'Do you have another question, or is there anything else I can help you with?');

  // If caller goes silent after the answer, prompt them
  twiml.redirect('/twilio/incoming');
}

module.exports = router;