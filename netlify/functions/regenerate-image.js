const { GoogleGenAI } = require('@google/genai');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
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

    let imageUrl = null;
    let imageError = null;

    if (imageProvider === 'gemini') {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Gemini API key not configured on server' })
        };
      }
      
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const imageResult = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `${imagePrompt}. The style should be professional, high-quality, suitable for a business blog.` }]
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1'
          }
        }
      });

      const parts = imageResult.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
      
      if (!imageUrl) {
        imageError = 'Gemini did not return an image. Try a different prompt.';
      }
    } else if (imageProvider === 'gemini-imagen' && userGeminiKey) {
      const userAI = new GoogleGenAI({ apiKey: userGeminiKey });
      const imageResult = await userAI.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `${imagePrompt}. The style should be professional, high-quality, suitable for a business blog.` }]
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1'
          }
        }
      });

      const parts = imageResult.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
      
      if (!imageUrl) {
        imageError = 'Gemini did not return an image. Try a different prompt.';
      }
    } else if (openaiKey) {
      const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'hd'
        })
      });

      const imageData = await imageResponse.json();
      if (imageData.error) {
        imageError = imageData.error.message;
      } else if (imageData.data && imageData.data[0]) {
        imageUrl = imageData.data[0].url;
      }
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No valid image provider configuration' })
      };
    }

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
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to regenerate image' })
    };
  }
};
