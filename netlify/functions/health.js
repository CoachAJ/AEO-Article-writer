exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      status: 'ok', 
      geminiConfigured: !!process.env.GEMINI_API_KEY 
    })
  };
};
