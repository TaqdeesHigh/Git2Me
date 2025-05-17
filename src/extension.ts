import * as vscode from 'vscode';
import { registerUpdateReadmeCommand } from './commands/updateReadme';
import { setupStatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext) {
  console.log('README Updater extension is now active');
  registerUpdateReadmeCommand(context);
  const statusBar = setupStatusBar();
  context.subscriptions.push(statusBar);
}

export function deactivate() {}