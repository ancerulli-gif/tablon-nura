// Netlify Function: proxy seguro hacia Google Gemini (gratuito)
// La API key vive como variable de entorno en Netlify, nunca en el HTML público

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "GEMINI_API_KEY no configurada en Netlify." }),
    };
  }

  try {
    const { messages } = JSON.parse(event.body);

    const systemPrompt = `Eres el asistente interno de NURA Hotels & More, una cadena hotelera en Mallorca con los establecimientos: Hotel Boreal, Hotel Cóndor, Magaluf Beach, Magaluf Apartamentos, Claudia by Nura (Campos), y Santa Ponça Pins.

Ayudas al equipo de recepción con:
1. Preguntas sobre procedimientos, normativas y protocolos internos del hotel.
2. Redactar o mejorar mensajes y respuestas para clientes (emails, WhatsApp, check-in, reclamaciones) en tono profesional y cordial, en español, inglés o el idioma que se solicite.

Responde siempre de forma breve, clara y práctica, como lo haría un compañero de trabajo con experiencia. Si no tienes información concreta sobre un procedimiento específico de NURA, dilo honestamente y sugiere consultar con el responsable (Toni o Ayla) en lugar de inventar datos.`;

    // Gemini format: contents array with role user/model, system goes in systemInstruction
    const geminiContents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || "Error de Gemini" }),
      };
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
