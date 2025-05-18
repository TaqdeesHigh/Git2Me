import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getApiKeys, getPreferredLlm, getAutoApprove, promptForMissingConfig, LlmProvider } from '../util/configManager';
import { getCommitHistory, getCodeChanges, getReadmeContent, saveReadmeContent } from '../api/github';
import { generateReadmeUpdate } from '../api/llm';
import { createPreviewPanel } from '../ui/previewPanel';

export function registerUpdateReadmeCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('readme-updater.updateReadme', async () => {
    try {
      const configValid = await promptForMissingConfig();
      if (!configValid) {
        return;
      }
      
      const apiKeys = await getApiKeys();
      const preferredLlm = await getPreferredLlm();
      const autoApprove = await getAutoApprove();

      if (!apiKeys.github) {
        throw new Error('GitHub token is required but not configured');
      }
      
      const llmKey = preferredLlm === LlmProvider.CLAUDE ? apiKeys.claude :
                     preferredLlm === LlmProvider.CHATGPT ? apiKeys.chatgpt :
                     apiKeys.gemini;
                     
      if (!llmKey) {
        throw new Error(`${preferredLlm} API key is required but not configured`);
      }
      const readmeContent = await getReadmeContent();
      if (readmeContent === undefined) {
        const choice = await vscode.window.showInformationMessage(
          'No README.md found. Would you like to generate a new one?',
          'Generate README',
          'Cancel'
        );
        
        if (choice !== 'Generate README') {
          return;
        }

        await handleNewReadmeGeneration(apiKeys, preferredLlm, autoApprove);
        return;
      }

      await handleReadmeUpdate(context, apiKeys, preferredLlm, autoApprove, readmeContent);
      
    } catch (error) {
      console.error('Error updating README:', error);
      vscode.window.showErrorMessage('Error updating README: ' + (error instanceof Error ? error.message : String(error)));
    }
  });
  
  context.subscriptions.push(command);
}

async function handleNewReadmeGeneration(
  apiKeys: { github?: string; claude?: string; chatgpt?: string; gemini?: string; },
  preferredLlm: LlmProvider,
  autoApprove: boolean
): Promise<void> {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Generating new README.md',
    cancellable: true
  }, async (progress, token) => {
    if (token.isCancellationRequested) return;
    
    progress.report({ message: 'Fetching repository information...' });
    const commits = await getCommitHistory(apiKeys.github!, 10);
    
    if (commits.length < 1) {
      throw new Error('No commit history found');
    }

    const latestCommit = commits[0];
    const earliestCommit = commits[commits.length - 1];
    
    progress.report({ message: 'Analyzing code...' });
    const codeChanges = await getCodeChanges(apiKeys.github!, earliestCommit.sha, latestCommit.sha);
    const commitMessages = commits
      .map(commit => `${commit.sha.substring(0, 7)} - ${commit.message}`)
      .join('\n');
    
    progress.report({ message: `Generating README.md using ${preferredLlm}...` });
    const newReadmeContent = await generateNewReadme(
      {
        claude: apiKeys.claude,
        chatgpt: apiKeys.chatgpt,
        gemini: apiKeys.gemini
      },
      codeChanges,
      commitMessages,
      preferredLlm
    );
    
    if (token.isCancellationRequested) {
      return;
    }
    if (autoApprove) {
      await saveNewReadme(newReadmeContent);
      vscode.window.showInformationMessage('New README.md has been created successfully!');
    } else {
      showReadmePreview("", 
        { 
          suggestedReadmeContent: newReadmeContent, 
          changeDescription: "Creating a new README.md file for this project based on codebase analysis." 
        }, 
        preferredLlm,
        autoApprove
      );
    }
  });
}

async function handleReadmeUpdate(
  context: vscode.ExtensionContext,
  apiKeys: { github?: string; claude?: string; chatgpt?: string; gemini?: string; },
  preferredLlm: LlmProvider,
  autoApprove: boolean,
  readmeContent: string
): Promise<void> {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Updating README.md',
    cancellable: true
  }, async (progress, token) => {
    if (token.isCancellationRequested) return;
    
    progress.report({ message: 'Fetching commit history...' });
    const commits = await getCommitHistory(apiKeys.github!, 10);
    
    if (commits.length < 1) {
      throw new Error('No commit history found');
    }
    
    const commitItems = commits.map(commit => ({
      label: commit.message.split('\n')[0],
      description: `${commit.sha.substring(0, 7)} by ${commit.author} on ${new Date(commit.date).toLocaleDateString()}`,
      commit
    }));
    
    const latestCommit = await vscode.window.showQuickPick(commitItems, {
      placeHolder: 'Select the latest commit',
      ignoreFocusOut: true
    });
    
    if (!latestCommit || token.isCancellationRequested) {
      return;
    }
    
    const olderCommits = commitItems.filter(item => 
      new Date(item.commit.date) < new Date(latestCommit.commit.date)
    );
    
    if (olderCommits.length === 0) {
      throw new Error('Not enough commit history to compare changes');
    }
    
    const olderCommit = await vscode.window.showQuickPick(olderCommits, {
      placeHolder: 'Select the older commit to compare against',
      ignoreFocusOut: true
    });
    
    if (!olderCommit || token.isCancellationRequested) {
      return;
    }

    progress.report({ message: 'Analyzing code changes...' });
    const codeChanges = await getCodeChanges(apiKeys.github!, olderCommit.commit.sha, latestCommit.commit.sha);
    
    const commitMessages = commits
      .filter(commit => 
        new Date(commit.date) >= new Date(olderCommit.commit.date) && 
        new Date(commit.date) <= new Date(latestCommit.commit.date)
      )
      .map(commit => `${commit.sha.substring(0, 7)} - ${commit.message}`)
      .join('\n');
    
    progress.report({ message: `Generating README update using ${preferredLlm}...` });
    const update = await generateReadmeUpdate(
      {
        claude: apiKeys.claude,
        chatgpt: apiKeys.chatgpt,
        gemini: apiKeys.gemini
      },
      readmeContent,
      codeChanges,
      commitMessages,
      preferredLlm
    );
    
    if (token.isCancellationRequested) {
      return;
    }

    const firstRun = !context.globalState.get('readmeUpdater.hasRunBefore');
    if (firstRun || !autoApprove) {
      showReadmePreview(readmeContent, update, preferredLlm, autoApprove);
      if (firstRun) {
        context.globalState.update('readmeUpdater.hasRunBefore', true);
      }
    } else {
      await saveReadmeContent(update.suggestedReadmeContent);
      vscode.window.showInformationMessage('README.md has been updated successfully!');
    }
  });
}

async function generateNewReadme(
  apiKeys: { claude?: string; chatgpt?: string; gemini?: string; },
  codeChanges: string,
  commitMessages: string,
  llmProvider: LlmProvider
): Promise<string> {
  const prompt = `
I need to create a new README.md file for my repository.

Here's information about the code base:
\`\`\`
${codeChanges}
\`\`\`

Recent commit messages:
\`\`\`
${commitMessages}
\`\`\`

Based on these details, please generate a comprehensive README.md file that includes:
1. A title and brief description of the project based on what you can infer
2. Installation instructions
3. Usage examples
4. Features
5. Configuration options if applicable
6. Any other relevant sections

The README should be well-structured, informative, and follow standard README best practices with proper markdown formatting.
Include appropriate badges if you can determine the technology stack.`;

  try {
    const response = await generateReadmeUpdate(
      apiKeys,
      "", // No current README content
      codeChanges,
      commitMessages,
      llmProvider
    );
    
    return response.suggestedReadmeContent;
  } catch (error) {
    console.error('Error generating new README:', error);
    throw error;
  }
}

async function saveNewReadme(content: string): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const readmePath = path.join(workspaceRoot, 'README.md');
    
    fs.writeFileSync(readmePath, content, 'utf8');
    const document = await vscode.workspace.openTextDocument(readmePath);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    console.error('Error saving new README:', error);
    throw error;
  }
}

function showReadmePreview(
  currentContent: string, 
  update: { suggestedReadmeContent: string, changeDescription: string }, 
  llmProvider: string,
  autoApprove: boolean
): void {
  const isNewReadme = currentContent === "";
  const callback = isNewReadme ? saveNewReadme : saveReadmeContent;
  
  createPreviewPanel(currentContent, update, llmProvider, autoApprove, callback);
}