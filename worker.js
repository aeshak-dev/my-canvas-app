export default {
  async fetch(request, env, ctx) {
    // 1. CORS Preflight Configuration
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      // 2. Fetch configured OpenAI API secrets
      const apiKeys = [
        env.OPENAI_API_KEY_1,
        env.OPENAI_API_KEY_2,
        env.OPENAI_API_KEY_3
      ].filter(Boolean);

      if (apiKeys.length === 0) {
        return new Response(JSON.stringify({ error: 'No OpenAI API keys configured.' }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
        });
      }

      const body = await request.json();
      const { type, prompt, image } = body;

      // 3. Helper function for Round-Robin rotation with rate-limit fallback
      async function callOpenAI(messages, model = 'gpt-4o') {
        const startIndex = Math.floor(Math.random() * apiKeys.length);

        for (let i = 0; i < apiKeys.length; i++) {
          const currentKey = apiKeys[(startIndex + i) % apiKeys.length];

          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: messages,
              max_tokens: 1000
            })
          });

          if (res.ok) {
            return await res.json();
          }

          console.warn(`Key Index ${(startIndex + i) % apiKeys.length} failed (${res.status}). Trying next key...`);
        }

        throw new Error('All configured OpenAI API keys failed or hit rate limits.');
      }

      let responseData;

      // 4. Request routing
      if (type === 'diagram') {
        const messages = [
          { role: 'system', content: 'You are a vector whiteboard AI. Provide concise visual layout textual representations or Markdown notes.' },
          { role: 'user', content: prompt }
        ];
        responseData = await callOpenAI(messages, 'gpt-4o');

      } else if (type === 'vision') {
        const messages = [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt || 'Analyze this whiteboard image and summarize notes.' },
              { type: 'image_url', image_url: { url: image } }
            ]
          }
        ];
        responseData = await callOpenAI(messages, 'gpt-4o');
      }

      // 5. Response output with CORS
      return new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
