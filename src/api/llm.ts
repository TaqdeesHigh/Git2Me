import * as vscode from 'vscode';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { LlmProvider } from '../util/configManager';

export interface LlmResponse {
  suggestedReadmeContent: string;
  changeDescription: string;
}

export async function generateReadmeUpdate(
  apiKeys: { [key: string]: string | undefined },
  currentReadme: string,
  codeChanges: string,
  commitMessages: string,
  llmProvider: LlmProvider = LlmProvider.CLAUDE
): Promise<LlmResponse> {
  const prompt = `
I need to update a README.md file based on recent code changes in my repository.

Current README content:
\`\`\`
${currentReadme}
\`\`\`

Recent code changes:
\`\`\`
${codeChanges}
\`\`\`

Recent commit messages:
\`\`\`
${commitMessages}
\`\`\`

Based on these changes, please suggest an updated version of the README.md file. Only make changes that are relevant to the code changes shown. Keep the existing structure and formatting where possible. Focus on updating:
1. Feature documentation that matches the new code
2. Installation or usage instructions if they've changed
3. API documentation if relevant APIs were modified
4. Examples that should be updated to match new functionality

Provide the full updated README.md content, including parts that didn't change.`;

  try {
    switch (llmProvider) {
      case LlmProvider.CLAUDE:
        return await callClaude(prompt, apiKeys.claude);
      case LlmProvider.CHATGPT:
        return await callChatGPT(prompt, apiKeys.chatgpt);
      case LlmProvider.GEMINI:
        return await callGemini(prompt, apiKeys.gemini);
      default:
        throw new Error(`Unsupported LLM provider: ${llmProvider}`);
    }
  } catch (error) {
    console.error('Error calling LLM API:', error);
    throw error;
  }
}

async function callClaude(prompt: string, apiKey: string | undefined): Promise<LlmResponse> {
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: "claude-3-opus-20240229",
      max_tokens: 4000,
      messages: [
        { role: "user", content: prompt }
      ]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }
  );

  const content = response.data.content[0].text;
  const readmeMatch = content.match(/```(?:markdown)?\n([\s\S]*?)\n```/);
  const suggestedReadmeContent = readmeMatch ? readmeMatch[1] : content;
  const changeDescription = content.split('```')[0].trim();

  return {
    suggestedReadmeContent,
    changeDescription
  };
}

async function callChatGPT(prompt: string, apiKey: string | undefined): Promise<LlmResponse> {
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: "gpt-4",
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: 4000
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }
  );
  
  const content = response.data.choices[0].message.content;
  const readmeMatch = content.match(/```(?:markdown)?\n([\s\S]*?)\n```/);
  const suggestedReadmeContent = readmeMatch ? readmeMatch[1] : content;
  const changeDescription = content.split('```')[0].trim();

  return {
    suggestedReadmeContent,
    changeDescription
  };
}

async function callGemini(prompt: string, apiKey: string | undefined): Promise<LlmResponse> {
  if (!apiKey) {
    throw new Error('Google API key not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(prompt);
  const content = result.response.text();
  const readmeMatch = content.match(/```(?:markdown)?\n([\s\S]*?)\n```/);
  const suggestedReadmeContent = readmeMatch ? readmeMatch[1] : content;
  const changeDescription = content.split('```')[0].trim();

  return {
    suggestedReadmeContent,
    changeDescription
  };
}