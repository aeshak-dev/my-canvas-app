let keyIndex = 0;

export default {
  async fetch(request, env) {
    // 1. Handle CORS Preflight Request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      // 2. Load OpenAI API Keys from Cloudflare Environment Secrets
      const apiKeys = [
        env.OPENAI_API_KEY1,
        env.OPENAI_API_KEY2,
        env.OPENAI_API_KEY3
      ].filter(Boolean); // Filters out any unset keys

      if (apiKeys.length === 0) {
        throw new Error("No OpenAI API keys found in Cloudflare environment variables.");
      }

      // 3. Round-Robin Key Rotation
      const selectedKey = apiKeys[keyIndex % apiKeys.length];
      keyIndex = (keyIndex + 1) % apiKeys.length;

      const body = await request.json();
      const { type, imageBase64, prompt, textToSummarize } = body;

      // --- ROUTE 1: Text-to-Image Generation (DALL·E 3) ---
      if (type === "text-to-image") {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${selectedKey}`
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: prompt || "a beautiful digital sketch",
            n: 1,
            size: "1024x1024",
            response_format: "b64_json"
          })
        });

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error.message);
        }

        const base64Image = `data:image/png;base64,${data.data[0].b64_json}`;

        return new Response(JSON.stringify({ imageBase64: base64Image }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // --- ROUTE 2: Selected Text AI Actions (Summarize / Details) ---
      if (type === "text-analysis") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${selectedKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: `${prompt}: "${textToSummarize}"`
              }
            ]
          })
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message);
        }

        // Return standardized payload format for frontend script
        const resultText = data.choices[0].message.content;
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ text: resultText }] }
          }]
        }), {
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*" 
          }
        });
      }

      // --- ROUTE 3: Canvas Vision Analysis ---
      const cleanBase64 = imageBase64 ? imageBase64.replace(/^data:image\/(png|jpeg|webp);base64,/, "") : "";

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${selectedKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt || "Describe what is visible on this canvas." },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${cleanBase64}`
                  }
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      const resultText = data.choices[0].message.content;
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: resultText }] }
        }]
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
};
