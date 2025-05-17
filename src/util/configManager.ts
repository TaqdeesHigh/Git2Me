import * as vscode from 'vscode';

export interface ApiKeys {
  github: string | undefined;
  claude: string | undefined;
  chatgpt: string | undefined;
  gemini: string | undefined;
}

export enum LlmProvider {
  CLAUDE = 'claude',
  CHATGPT = 'chatgpt',
  GEMINI = 'gemini'
}

export async function ensureConfiguration(): Promise<void> {
  const config = vscode.workspace.getConfiguration('readme-updater');
  
  const preferredLlm = config.get<string>('preferredLlm');
  if (!preferredLlm || !Object.values(LlmProvider).includes(preferredLlm as LlmProvider)) {
    await config.update('preferredLlm', LlmProvider.CLAUDE, vscode.ConfigurationTarget.Global);
  }
  
  const autoApprove = config.get<boolean>('autoApprove');
  if (autoApprove === undefined) {
    await config.update('autoApprove', false, vscode.ConfigurationTarget.Global);
  }
}

export async function getApiKeys(): Promise<ApiKeys> {
  const config = vscode.workspace.getConfiguration('readme-updater');
  
  return {
    github: config.get<string>('githubToken'),
    claude: config.get<string>('anthropicApiKey'),
    chatgpt: config.get<string>('openaiApiKey'),
    gemini: config.get<string>('geminiApiKey')
  };
}

export async function getPreferredLlm(): Promise<LlmProvider> {
  const config = vscode.workspace.getConfiguration('readme-updater');
  const preferredLlm = config.get<string>('preferredLlm') as LlmProvider;
  return preferredLlm || LlmProvider.CLAUDE;
}

export async function getAutoApprove(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('readme-updater');
  return config.get<boolean>('autoApprove') === true;
}

export async function promptForMissingConfig(): Promise<boolean> {
  const apiKeys = await getApiKeys();
  const preferredLlm = await getPreferredLlm();
  if (!apiKeys.github) {
    const action = await vscode.window.showErrorMessage(
      'GitHub token is required to access repository data. Would you like to set it up now?',
      'Open Settings'
    );
    
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'readme-updater.githubToken');
    }
    return false;
  }
  const missingPreferredKey = !apiKeys[preferredLlm];
  if (missingPreferredKey) {
    const settingName = `readme-updater.${preferredLlm === 'claude' ? 'anthropic' : preferredLlm}ApiKey`;
    const action = await vscode.window.showErrorMessage(
      `${preferredLlm.charAt(0).toUpperCase() + preferredLlm.slice(1)} API key is required. Would you like to set it up now?`,
      'Open Settings',
      'Use Different LLM'
    );
    
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', settingName);
      return false;
    } else if (action === 'Use Different LLM') {
      for (const [key, value] of Object.entries(apiKeys)) {
        if (key !== 'github' && value) {
          const provider = key as LlmProvider;
          await vscode.workspace.getConfiguration('readme-updater').update(
            'preferredLlm', 
            provider, 
            vscode.ConfigurationTarget.Global
          );
          vscode.window.showInformationMessage(`Switched to ${provider} as your preferred LLM provider.`);
          return true;
        }
      }
      const setupAction = await vscode.window.showInformationMessage(
        'Please set up at least one LLM API key to continue.',
        'Claude (Recommended)',
        'ChatGPT',
        'Gemini'
      );
      
      if (setupAction) {
        const llm = setupAction === 'Claude (Recommended)' ? 'anthropic' : 
                   setupAction === 'ChatGPT' ? 'openai' : 'gemini';
        await vscode.commands.executeCommand('workbench.action.openSettings', `readme-updater.${llm}ApiKey`);
      }
      return false;
    }
    return false;
  }
  
  return true;
}