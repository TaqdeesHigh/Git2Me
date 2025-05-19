import * as vscode from 'vscode';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { LlmProvider, TokenLimit } from '../util/configManager';

export interface LlmResponse {
  suggestedReadmeContent: string;
  changeDescription: string;
}

export async function generateReadmeUpdate(
  apiKeys: { [key: string]: string | undefined },
  currentReadme: string,
  codeChanges: string,
  commitMessages: string,
  llmProvider: LlmProvider = LlmProvider.CLAUDE,
  tokenLimit: TokenLimit = TokenLimit.MEDIUM
): Promise<LlmResponse> {
  let sizeGuidance = '';
  let maxTokens = 0;
  
  switch (tokenLimit) {
    case TokenLimit.SMALL:
      sizeGuidance = 'Create a concise README with only essential information. Aim for brevity (300-500 words).';
      maxTokens = 2000;
      break;
    case TokenLimit.MEDIUM:
      sizeGuidance = 'Create a balanced README with moderate detail (500-800 words).';
      maxTokens = 10000;
      break;
    case TokenLimit.LARGE:
      sizeGuidance = 'Create a comprehensive README with detailed documentation (800+ words).';
      maxTokens = 20000;
      break;
  }

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

${sizeGuidance}

Based on these changes, please suggest an updated version of the README.md file. Only make changes that are relevant to the code changes shown. Keep the existing structure and formatting where possible. Focus on updating:
1. Feature documentation that matches the new code
2. Installation or usage instructions if they've changed
3. API documentation if relevant APIs were modified
4. Examples that should be updated to match new functionality

Provide the full updated README.md content, including parts that didn't change. The README must be complete - never leave any section unfinished.`;

  try {
    switch (llmProvider) {
      case LlmProvider.CLAUDE:
        return await callClaude(prompt, apiKeys.claude, maxTokens);
      case LlmProvider.CHATGPT:
        return await callChatGPT(prompt, apiKeys.chatgpt, maxTokens);
      case LlmProvider.GEMINI:
        return await callGemini(prompt, apiKeys.gemini, maxTokens);
      default:
        throw new Error(`Unsupported LLM provider: ${llmProvider}`);
    }
  } catch (error) {
    console.error('Error calling LLM API:', error);
    throw error;
  }
}

async function callClaude(prompt: string, apiKey: string | undefined, maxTokens: number): Promise<LlmResponse> {
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: "claude-3-opus-20240229",
      max_tokens: maxTokens,
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
  let suggestedReadmeContent = readmeMatch ? readmeMatch[1] : content;

  if (suggestedReadmeContent.endsWith('...') || 
      suggestedReadmeContent.includes('[incomplete') || 
      suggestedReadmeContent.includes('to be continued')) {
    return await requestReadmeCompletion(suggestedReadmeContent, 'claude', apiKey);
  }
  
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

async function callChatGPT(prompt: string, apiKey: string | undefined, maxTokens: number): Promise<LlmResponse> {
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
      max_tokens: maxTokens
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
  let suggestedReadmeContent = readmeMatch ? readmeMatch[1] : content;

  if (suggestedReadmeContent.endsWith('...') || 
      suggestedReadmeContent.includes('[incomplete') || 
      suggestedReadmeContent.includes('to be continued')) {
    return await requestReadmeCompletion(suggestedReadmeContent, 'chatgpt', apiKey);
  }
  
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

async function callGemini(prompt: string, apiKey: string | undefined, maxTokens: number): Promise<LlmResponse> {
  if (!apiKey) {
    throw new Error('Google API key not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: {
      maxOutputTokens: maxTokens,
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

    if (suggestedReadmeContent.endsWith('...') || 
        suggestedReadmeContent.includes('[incomplete') || 
        suggestedReadmeContent.includes('to be continued')) {
      return await requestReadmeCompletion(suggestedReadmeContent, 'gemini', apiKey);
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

async function requestReadmeCompletion(incompleteReadme: string, provider: string, apiKey: string): Promise<LlmResponse> {
  const completionPrompt = `
I have an incomplete README.md that needs to be finished:

\`\`\`
${incompleteReadme}
\`\`\`

Please complete this README.md file, ensuring it's properly structured and comprehensive. 
Don't repeat content that's already there, just continue from where it left off and make it coherent.
Provide the COMPLETE README.md content, including the parts already written above.`;

  try {
    switch (provider) {
      case 'claude':
        const claudeResponse = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: "claude-3-opus-20240229",
            max_tokens: 20000,
            messages: [
              { role: "user", content: completionPrompt }
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
        
        const claudeContent = claudeResponse.data.content[0].text;
        const claudeReadmeMatch = claudeContent.match(/```(?:markdown)?\s*([\s\S]*?)\s*```/);
        const claudeSuggestedReadme = claudeReadmeMatch ? claudeReadmeMatch[1] : claudeContent;
        
        return {
          suggestedReadmeContent: claudeSuggestedReadme,
          changeDescription: "README has been completed based on the initial incomplete version."
        };
        
      case 'chatgpt':
        const gptResponse = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: "gpt-4",
            messages: [
              { role: "user", content: completionPrompt }
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
        
        const gptContent = gptResponse.data.choices[0].message.content;
        const gptReadmeMatch = gptContent.match(/```(?:markdown)?\s*([\s\S]*?)\s*```/);
        const gptSuggestedReadme = gptReadmeMatch ? gptReadmeMatch[1] : gptContent;
        
        return {
          suggestedReadmeContent: gptSuggestedReadme,
          changeDescription: "README has been completed based on the initial incomplete version."
        };
        
      case 'gemini':
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.0-flash",
          generationConfig: {
            maxOutputTokens: 20000,
            temperature: 0.2,
          }
        });
        
        const result = await model.generateContent(completionPrompt);
        const geminiContent = result.response.text().trim();
        let geminiSuggestedReadme = geminiContent;
        if (geminiSuggestedReadme.startsWith("```") && geminiSuggestedReadme.endsWith("```")) {
          geminiSuggestedReadme = geminiSuggestedReadme
            .replace(/^```(?:markdown)?/, '')
            .replace(/```$/, '')
            .trim();
        }
        
        return {
          suggestedReadmeContent: geminiSuggestedReadme,
          changeDescription: "README has been completed based on the initial incomplete version."
        };
        
      default:
        throw new Error(`Unsupported provider for completion: ${provider}`);
    }
  } catch (error) {
    console.error('Error completing README:', error);
    throw error;
  }
}