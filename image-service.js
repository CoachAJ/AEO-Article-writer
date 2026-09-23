const { GoogleGenAI } = require('@google/genai');

function getPollinationsUrl(prompt) {
  const cleanPrompt = (prompt || 'modern business illustration').slice(0, 500);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&nologo=true`;
}

async function generateArticleImage({
  prompt,
  imageProvider,
  ai,
  userGeminiKey,
  openaiKey,
  generateContent
}) {
  if (!prompt || !imageProvider || imageProvider === 'none') {
    return { imageUrl: null, imageError: null };
  }

  if (imageProvider === 'pollinations') {
    return { imageUrl: getPollinationsUrl(prompt), imageError: null };
  }

  if (imageProvider === 'gemini' || (imageProvider === 'gemini-imagen' && userGeminiKey)) {
    const client = imageProvider === 'gemini-imagen' && userGeminiKey
      ? new GoogleGenAI({ apiKey: userGeminiKey })
      : ai;

    if (!client) {
      return { imageUrl: getPollinationsUrl(prompt), imageError: null };
    }

    try {
      const imageResult = await generateContent(client, {
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `${prompt}. The style should be professional, high-quality, suitable for a business blog.` }]
        },
        config: {
          imageConfig: { aspectRatio: '1:1' }
        }
      });

      const parts = imageResult.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          return {
            imageUrl: `data:image/png;base64,${part.inlineData.data}`,
            imageError: null
          };
        }
      }
      return { imageUrl: getPollinationsUrl(prompt), imageError: null };
    } catch (err) {
      const status = Number(err?.status ?? err?.code ?? err?.statusCode);
      // If Google free tier rejects with 429 quota 0, gracefully fall back to Pollinations
      if (status === 429 || /quota/i.test(err?.message || '')) {
        return {
          imageUrl: getPollinationsUrl(prompt),
          imageError: null
        };
      }
      return {
        imageUrl: getPollinationsUrl(prompt),
        imageError: null
      };
    }
  }

  if (openaiKey || imageProvider === 'openai') {
    const key = openaiKey;
    if (!key) {
      return { imageUrl: null, imageError: 'OpenAI API key is required for DALL-E 3' };
    }
    try {
      const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: prompt.slice(0, 1000),
          n: 1,
          size: '1024x1024',
          quality: 'standard'
        })
      });

      const imageData = await imageResponse.json();
      if (imageData.error) {
        return { imageUrl: null, imageError: imageData.error.message };
      }
      if (imageData.data?.[0]?.url) {
        return { imageUrl: imageData.data[0].url, imageError: null };
      }
      return { imageUrl: null, imageError: 'No image returned by OpenAI' };
    } catch (err) {
      return { imageUrl: null, imageError: `Failed to generate image: ${err.message}` };
    }
  }

  return { imageUrl: null, imageError: 'Invalid image provider' };
}

module.exports = { generateArticleImage, getPollinationsUrl };
