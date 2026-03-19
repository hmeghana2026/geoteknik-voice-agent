const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getAIResponse(userQuery, manualContext, customerInfo) {
  const hasContext = manualContext && manualContext.trim().length > 0;

  const systemPrompt = `You are a friendly and professional technical support agent for Geoteknik.
The customer's name is ${customerInfo?.name || 'the customer'}.
They are asking about the product: ${customerInfo?.currentProduct || 'unknown product'}.

${hasContext
  ? `Use this section from the product manual to answer:\n\n${manualContext}`
  : `No manual content was found for this question. Answer using your general technical knowledge and clearly say: "This isn't covered in the manual, but based on general knowledge..."`
}

Keep your answer concise and clear — this is a phone call, so speak naturally. No bullet points or markdown. Maximum 3 sentences.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: userQuery }]
  });

  return message.content[0].text;
}

module.exports = { getAIResponse };