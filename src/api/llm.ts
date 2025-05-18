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
      max_tokens: 20000,
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
  const readmeMatch = content.match(/```(?:markdown)?\s*([\s\S]*?)\s*```/);
  const suggestedReadmeContent = readmeMatch ? readmeMatch[1] : content;
  let changeDescription = '';
  if (content.includes('```')) {
    changeDescription = content.split('```')[0].trim();
  } else {
    changeDescription = content.split('\n\n')[0].trim();
  }

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
      max_tokens: 20000
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }
  );
  
  const content = response.data.choices[0].message.content;
  const readmeMatch = content.match(/```(?:markdown)?\s*([\s\S]*?)\s*```/);
  const suggestedReadmeContent = readmeMatch ? readmeMatch[1] : content;
  let changeDescription = '';
  if (content.includes('```')) {
    changeDescription = content.split('```')[0].trim();
  } else {
    changeDescription = content.split('\n\n')[0].trim();
  }

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
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: {
      maxOutputTokens: 100000,
      temperature: 0.2,
    }
  });
  
  const readmePrompt = prompt + "\n\nPlease ONLY output the complete README.md file with NO additional text before or after it. Don't stop until you've completed the entire README.";
  
  try {
    const result = await model.generateContent(readmePrompt);
    const readmeContent = result.response.text().trim();
    let suggestedReadmeContent = readmeContent;
    if (suggestedReadmeContent.startsWith("```") && suggestedReadmeContent.endsWith("```")) {
      suggestedReadmeContent = suggestedReadmeContent
        .replace(/^```(?:markdown)?/, '')
        .replace(/```$/, '')
        .trim();
    }
    
    const descPrompt = prompt + "\n\nBased on the changes described above, please provide ONLY a brief summary (1-3 sentences) of the key changes made to the README.";
    const descResult = await model.generateContent(descPrompt);
    const changeDescription = descResult.response.text().trim();

    return {
      suggestedReadmeContent,
      changeDescription
    };
  } catch (error) {
    console.error("Error generating content with Gemini:", error);
    throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
  }
}