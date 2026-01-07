/**
 * AI Code Assistant Controller
 * Uses OpenAI GPT-4o for code assistance
 */
export const assistWithCode = async (req, res, next) => {
  const { prompt, code, language = 'javascript' } = req.body;
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      response: '⚠️ AI Assistant is not configured. Add your OPENAI_API_KEY to the backend .env file to enable this feature.\n\nGet your API key at: https://platform.openai.com/api-keys',
    });
  }
  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are an expert ${language} developer and code reviewer integrated into DevSpace, a real-time collaborative coding platform. 
You help developers write better code, find bugs, add types, write tests, explain concepts, and improve architecture.
Keep responses concise, actionable, and well-formatted with code examples when relevant.
Always use markdown for code blocks.`;

    const userMessage = code
      ? `Context - Current file (${language}):\n\`\`\`${language}\n${code.slice(0, 3000)}\n\`\`\`\n\nUser question: ${prompt}`
      : prompt;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    });

    res.json({ response: completion.choices[0].message.content });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ response: 'Invalid OpenAI API key. Please check your OPENAI_API_KEY.' });
    next(err);
  }
};
