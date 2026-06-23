// Netlify Function: proxy seguro hacia OpenAI
// La API key vive como variable de entorno en Netlify, nunca en el HTML público

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "OPENAI_API_KEY no configurada en Netlify." }),
    };
  }

  try {
    const { messages } = JSON.parse(event.body);

    const systemPrompt = `Eres el asistente interno de NURA Hotels & More, una cadena hotelera en Mallorca con los establecimientos: Hotel Boreal, Hotel Cóndor, Magaluf Beach, Magaluf Apartamentos, Claudia by Nura (Campos), y Santa Ponça Pins.

Ayudas al equipo de recepción con:
1. Preguntas sobre procedimientos, normativas y protocolos internos del hotel.
2. Redactar o mejorar mensajes y respuestas para clientes (emails, WhatsApp, check-in, reclamaciones) en tono profesional y cordial, en español, inglés o el idioma que se solicite.

Responde siempre de forma breve, clara y práctica, como lo haría un compañero de trabajo con experiencia. Si no tienes información concreta sobre un procedimiento específico de NURA, dilo honestamente y sugiere consultar con el responsable (Toni o Ayla) en lugar de inventar datos.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: 600,
        temperature: 0.4,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || "Error de OpenAI" }),
      };
    }

    const reply = data.choices?.[0]?.message?.content || "Sin respuesta.";

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
