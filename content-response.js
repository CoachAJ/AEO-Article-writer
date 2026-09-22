const contentGenerationConfig = {
  temperature: 0.7,
  maxOutputTokens: 16384,
  thinkingConfig: { thinkingLevel: 'LOW' },
  responseMimeType: 'application/json',
  responseJsonSchema: {
    type: 'object',
    properties: {
      articleMarkdown: { type: 'string' },
      imagePrompt: { type: 'string' },
      mediumCopy: { type: 'string' },
      linkedinCopy: { type: 'string' }
    },
    required: ['articleMarkdown', 'imagePrompt', 'mediumCopy', 'linkedinCopy'],
    additionalProperties: false
  }
};

function parseContentResponse(result) {
  const finishReason = result?.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('The AI response was cut off before it finished. Please try a shorter topic or request a shorter article.');
  }
  if (result?.promptFeedback?.blockReason || (finishReason && finishReason !== 'STOP')) {
    throw new Error('Google could not generate a complete response for this request. Please rephrase your topic and try again.');
  }

  const text = result?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Google returned an empty response. Please try again.');
  }

  const json = text.trim();
  const fenced = json.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  let content;
  try {
    content = JSON.parse(fenced ? fenced[1] : json);
  } catch {
    throw new Error('Google returned invalid JSON instead of a publishing kit. Please try again.');
  }

  const fields = contentGenerationConfig.responseJsonSchema.required;
  if (!content || Array.isArray(content) || fields.some(field => typeof content[field] !== 'string' || !content[field].trim())) {
    throw new Error('Google returned an incomplete publishing kit. Please try again.');
  }
  return content;
}

module.exports = { contentGenerationConfig, parseContentResponse };
