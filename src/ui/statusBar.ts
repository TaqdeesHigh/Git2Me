import * as vscode from 'vscode';

export function setupStatusBar(): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(book) Update README";
  statusBarItem.tooltip = "Update README.md from commit changes";
  statusBarItem.command = "git2me.updateReadme";
  statusBarItem.show();
  
  return statusBarItem;
}