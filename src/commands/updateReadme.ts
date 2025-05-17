import * as vscode from 'vscode';
import { getApiKeys, getPreferredLlm, getAutoApprove, promptForMissingConfig, LlmProvider } from '../util/configManager';
import { getCommitHistory, getCodeChanges, getReadmeContent, saveReadmeContent } from '../api/github';
import { generateReadmeUpdate } from '../api/llm';
import { createPreviewPanel } from '../ui/previewPanel';

export function registerUpdateReadmeCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('readme-updater.updateReadme', async () => {
    try {
      // Ensure we have all required configuration
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
        const readmeContent = await getReadmeContent();
        
        if (!readmeContent) {
          throw new Error('Could not read README.md content');
        }
        
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

        // Always show preview if it's the first run or auto-approve is disabled
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
      
    } catch (error) {
      console.error('Error updating README:', error);
      vscode.window.showErrorMessage('Error updating README: ' + (error instanceof Error ? error.message : String(error)));
    }
  });
  
  context.subscriptions.push(command);
}

function showReadmePreview(
  currentContent: string, 
  update: { suggestedReadmeContent: string, changeDescription: string }, 
  llmProvider: string,
  autoApprove: boolean
): void {
  createPreviewPanel(currentContent, update, llmProvider, autoApprove, saveReadmeContent);
}