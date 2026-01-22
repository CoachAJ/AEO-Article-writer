const { GoogleGenerativeAI } = require('@google/generative-ai');

// Simple markdown to HTML converter
function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Unordered lists
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
    // Numbered lists
    .replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Wrap list items
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  // Clean up multiple ul tags
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  
  return `<div class="article-content"><p>${html}</p></div>`;
}

exports.handler = async (event, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
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
    const { 
      topic, 
      businessType, 
      websiteUrl, 
      bookingUrl, 
      phone,
      openaiKey,
      userGeminiKey,
      imageProvider 
    } = JSON.parse(event.body);

    if (!topic || !businessType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Topic and Business Type are required' })
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Gemini API key not configured on server' })
      };
    }

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const isHealthTopic = /health|medical|disease|nutrition|supplement|vitamin|mineral|wellness|diet|symptom|treatment|cure|doctor|patient|body|immune|chronic|deficien/i.test(topic + ' ' + businessType);

    const healthGuidance = isHealthTopic ? `
IMPORTANT - For health-related content, follow these principles from the Triangle of Disease framework:
- Focus on nutritional deficiencies as root causes of health issues
- Emphasize the importance of the 90 essential nutrients (60 minerals, 16 vitamins, 12 amino acids, 2-3 essential fatty acids)
- Reference how mineral depletion in soil affects food nutrition
- Discuss how the body can heal itself when given proper nutrition
- Avoid making direct medical claims; instead focus on nutritional support
- Reference the connection between specific nutrients and body systems
- Connect symptoms to potential mineral deficiencies
- Do NOT include links to triangleofdisease.com or iwhhealthhub.com in the generated content
` : '';

    const systemPrompt = `You are an AEO (Answer Engine Optimization) expert. Generate content structured for AI search engines like ChatGPT, Perplexity, and Google AI Overviews.
${healthGuidance}
Your content MUST follow these AEO principles:
- Start each H2 section with a **bolded direct answer** in the first sentence
- Use frequent bulleted and numbered lists
- Include high entity density (specific names, numbers, facts)
- Write in a clear, authoritative tone
- Structure content to be easily extractable by AI systems

You must output ONLY a valid JSON object (no markdown code blocks, no extra text) with these exact keys:

{
  "articleMarkdown": "The full blog post in Markdown format. Include a compelling H1 title, multiple H2 sections with bolded direct answers, lists, and actionable content. ${websiteUrl || bookingUrl || phone ? `End with a '## Contact Us' section. Format URLs as clickable markdown links like [Visit Our Website](url). Include: ${websiteUrl ? `Website link: [Visit Our Website](${websiteUrl})` : ''} ${bookingUrl ? `Booking link: [Schedule a Consultation](${bookingUrl})` : ''} ${phone ? `Phone: ${phone}` : ''}` : 'Do NOT include a Contact Us section.'}",
  "imagePrompt": "A detailed, photographic prompt for generating an image relevant to the article. Describe the scene, lighting, style, and key visual elements. Make it professional and suitable for a business blog.",
  "mediumCopy": "A formatted block for Medium with:\\n\\nTITLE: [Compelling title]\\n\\nSUBTITLE: [Engaging subtitle that hooks readers]\\n\\n[First 2-3 paragraphs of the article, optimized for Medium's audience]",
  "linkedinCopy": "A short, engaging LinkedIn post (under 1300 characters) summarizing the key insights. Include:\\n- 2-3 relevant emojis\\n- A hook in the first line\\n- 3-5 bullet points of key takeaways\\n- A call to action\\n- 5-7 relevant hashtags"
}`;

    const userPrompt = `Create an AEO-optimized publishing kit for:

Topic/Question: ${topic}
Business Type/Industry: ${businessType}
${websiteUrl ? `Website URL: ${websiteUrl}` : ''}
${bookingUrl ? `Booking/Evaluation URL: ${bookingUrl}` : ''}
${phone ? `Phone Number: ${phone}` : ''}

Generate comprehensive, valuable content that positions the business as an authority in their field.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      }
    });

    const responseText = result.response.text();
    
    // Parse the JSON response
    let contentData;
    try {
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      contentData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw response:', responseText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to parse AI response. Please try again.' })
      };
    }

    // Step 2: Generate image
    let imageUrl = null;
    let imageError = null;

    if (contentData.imagePrompt && (imageProvider === 'gemini' || imageProvider === 'gemini-imagen' || openaiKey)) {
      try {
        if (imageProvider === 'gemini') {
          // Use Gemini 2.0 Flash (free tier supports image generation)
          const imageModel = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: {
              responseModalities: ['Text', 'Image']
            }
          });
          
          const imageResult = await imageModel.generateContent(
            `Generate an image based on this description. Only output the image, no text: ${contentData.imagePrompt}`
          );

          const response = imageResult.response;
          const parts = response.candidates?.[0]?.content?.parts || [];
          
          let imageBase64 = null;
          for (const part of parts) {
            if (part.inlineData) {
              imageBase64 = part.inlineData.data;
              const mimeType = part.inlineData.mimeType || 'image/png';
              imageUrl = `data:${mimeType};base64,${imageBase64}`;
              break;
            }
          }
          
          if (!imageUrl) {
            imageError = 'Gemini did not return an image. Try a different prompt.';
          }
        } else if (imageProvider === 'gemini-imagen' && userGeminiKey) {
          // Use Gemini Imagen 3 with user's API key (HD quality)
          const userGenAI = new GoogleGenerativeAI(userGeminiKey);
          const imagenModel = userGenAI.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
          
          const imageResult = await imagenModel.generateImages({
            prompt: contentData.imagePrompt,
            config: {
              numberOfImages: 1,
              aspectRatio: '1:1'
            }
          });

          if (imageResult.images && imageResult.images.length > 0) {
            const imageBase64 = imageResult.images[0].image.imageBytes;
            imageUrl = `data:image/png;base64,${imageBase64}`;
          } else {
            imageError = 'Gemini Imagen 3 did not return an image. Try a different prompt.';
          }
        } else if (openaiKey) {
          // Use DALL-E 3
          const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
              model: 'dall-e-3',
              prompt: contentData.imagePrompt,
              n: 1,
              size: '1024x1024',
              quality: 'standard'
            })
          });

          const imageData = await imageResponse.json();
          
          if (imageData.error) {
            imageError = imageData.error.message;
          } else if (imageData.data && imageData.data[0]) {
            imageUrl = imageData.data[0].url;
          }
        }
      } catch (imgErr) {
        console.error('Image generation error:', imgErr);
        imageError = `Failed to generate image: ${imgErr.message}`;
      }
    }

    // Return combined response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        articleMarkdown: contentData.articleMarkdown,
        articleHtml: markdownToHtml(contentData.articleMarkdown),
        imagePrompt: contentData.imagePrompt,
        imageUrl: imageUrl,
        imageError: imageError,
        mediumCopy: contentData.mediumCopy,
        linkedinCopy: contentData.linkedinCopy
      })
    };

  } catch (error) {
    console.error('Generation error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'An error occurred during generation' })
    };
  }
};
