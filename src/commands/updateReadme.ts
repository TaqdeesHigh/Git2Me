import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCommitHistory, getCodeChanges, getReadmeContent } from '../api/github';
import { generateReadmeUpdate, LlmResponse } from '../api/llm';
import { createPreviewPanel } from '../ui/previewPanel';

export function registerUpdateReadmeCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('readme-updater.updateReadme', async () => {
    try {
      const config = vscode.workspace.getConfiguration('readme-updater');
      const preferredLlm = config.get('preferredLlm') as string;
      const autoApprove = config.get('autoApprove') as boolean;
      
      if (!config.get('githubToken')) {
        throw new Error('GitHub token not configured. Please add it in extension settings.');
      }
      
      if (!config.get(`${preferredLlm}ApiKey`)) {
        throw new Error(`${preferredLlm} API key not configured. Please add it in extension settings.`);
      }

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Updating README.md',
        cancellable: true
      }, async (progress, token) => {
        progress.report({ message: 'Fetching commit history...' });
        const commits = await getCommitHistory(10);
        
        if (commits.length < 1) {
          throw new Error('Not enough commit history found');
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
        
        const olderCommits = commitItems.filter(item => item.commit.date < latestCommit.commit.date);
        const olderCommit = await vscode.window.showQuickPick(olderCommits, {
          placeHolder: 'Select the older commit to compare against',
          ignoreFocusOut: true
        });
        
        if (!olderCommit || token.isCancellationRequested) {
          return;
        }

        progress.report({ message: 'Analyzing code changes...' });
        const codeChanges = await getCodeChanges(olderCommit.commit.sha, latestCommit.commit.sha);
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
          readmeContent,
          codeChanges,
          commitMessages,
          preferredLlm
        );
        
        if (token.isCancellationRequested) {
          return;
        }

        if (autoApprove) {
          await applyReadmeChanges(update.suggestedReadmeContent);
          vscode.window.showInformationMessage('README.md has been updated successfully');
        } else {
          showReadmePreview(readmeContent, update, preferredLlm);
        }
      });
      
    } catch (error) {
      console.error('Error updating README:', error);
      vscode.window.showErrorMessage('Error updating README: ' + (error as Error).message);
    }
  });
  context.subscriptions.push(command);
}
async function applyReadmeChanges(newContent: string): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const readmePath = path.join(workspaceRoot, 'README.md');
    
    fs.writeFileSync(readmePath, newContent, 'utf8');
    
    const document = await vscode.workspace.openTextDocument(readmePath);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    console.error('Error applying README changes:', error);
    vscode.window.showErrorMessage('Error applying README changes: ' + (error as Error).message);
  }
}

function showReadmePreview(currentContent: string, update: LlmResponse, llmProvider: string): void {
  createPreviewPanel(currentContent, update, llmProvider, applyReadmeChanges);
}