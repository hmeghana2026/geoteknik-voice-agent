const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getAIResponse(userQuery, manualContext, customerInfo) {
  const hasContext = manualContext && manualContext.trim().length > 0;

  const systemPrompt = `You are a friendly and professional technical support agent for Geoteknik.
The customer is asking about the product: ${customerInfo?.currentProduct || 'unknown product'}.

${hasContext
  ? `Use this section from the product manual to answer:\n\n${manualContext}`
  : `No manual content was found. Answer using your general technical knowledge and say: "This isn't covered in the manual, but based on general knowledge..."`
}

Keep your answer concise and clear — this is a phone call. No bullet points or markdown. Maximum 3 sentences.`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userQuery);
  return result.response.text();
}

module.exports = { getAIResponse };