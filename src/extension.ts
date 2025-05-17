import * as vscode from 'vscode';
import { registerUpdateReadmeCommand } from './commands/updateReadme';
import { setupStatusBar } from './ui/statusBar';
import { ensureConfiguration } from './util/configManager';

export async function activate(context: vscode.ExtensionContext) {
  console.log('README Updater extension is now active');
  
  // Ensure configuration is properly set up
  await ensureConfiguration();
  
  // Register the command and status bar
  registerUpdateReadmeCommand(context);
  const statusBar = setupStatusBar();
  context.subscriptions.push(statusBar);
  
  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get('readmeUpdater.hasShownWelcome');
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage(
      'README Updater is active! Click the "Update README" button in the status bar to update your README based on recent commits.',
      'Set up API Keys'
    ).then(selection => {
      if (selection === 'Set up API Keys') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'readme-updater');
      }
    });
    context.globalState.update('readmeUpdater.hasShownWelcome', true);
  }
}

export function deactivate() {}