/**
 * The demo model is deterministic, offline, free and used by default.
 * Real providers only run when explicitly selected, and require their own API key.
 * This node produces an artifact draft; it never executes tools.
 */
export async function draftMarkdown(modelId: string, objective: string): Promise<string> {
  if (modelId === 'mock') {
    return `# Runtime PoC\n\n## Objective\n\n${objective}\n\n## Result\n\nThis draft was produced by the deterministic offline mock model.\n`;
  }
  const [provider, ...rest] = modelId.split(':');
  const name = rest.join(':');
  if (!name) throw new Error('Specify provider:model-id, e.g. openai:your-model');

  // We intentionally use providers directly rather than the AI Gateway,
  // avoiding implicit routing of task content through another service.
  let model;
  switch (provider) {
    case 'openai': {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
      const { openai } = await import('@ai-sdk/openai');
      model = openai(name);
      break;
    }
    case 'anthropic': {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
      const { anthropic } = await import('@ai-sdk/anthropic');
      model = anthropic(name);
      break;
    }
    case 'google': {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
      }
      const { google } = await import('@ai-sdk/google');
      model = google(name);
      break;
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  const { generateText } = await import('ai');
  const result = await generateText({
    model,
    maxOutputTokens: 500,
    system: 'Write a short, safe Markdown note. Return Markdown only. No shell commands.',
    prompt: `Create a short Markdown note (under 250 words) for this objective:\n${objective}`,
  });
  return result.text.trim() + '\n';
}
