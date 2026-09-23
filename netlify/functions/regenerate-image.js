const { GoogleGenAI } = require('@google/genai');
const { createGeminiGenerator, GeminiUnavailableError } = require('../../gemini-retry');
const { generateArticleImage } = require('../../image-service');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  const generateContent = createGeminiGenerator(context);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { imagePrompt, imageProvider, openaiKey, userGeminiKey } = JSON.parse(event.body);

    if (!imagePrompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Image prompt is required' })
      };
    }

    if (!imageProvider || imageProvider === 'none') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Please select an image provider' })
      };
    }

    const geminiKey = userGeminiKey || process.env.GEMINI_API_KEY;
    const ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

    const { imageUrl, imageError } = await generateArticleImage({
      prompt: imagePrompt,
      imageProvider,
      ai,
      userGeminiKey,
      openaiKey,
      generateContent
    });

    if (imageError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: imageError })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, imageUrl })
    };

  } catch (error) {
    console.error('Image regeneration error:', error);
    return {
      statusCode: error instanceof GeminiUnavailableError ? error.statusCode : 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to regenerate image' })
    };
  }
};
