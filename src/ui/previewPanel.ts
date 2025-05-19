import * as vscode from 'vscode';
import * as diff from 'diff';
import { TokenLimit } from '../util/configManager';

export function createPreviewPanel(
  currentContent: string,
  update: { suggestedReadmeContent: string, changeDescription: string },
  llmProvider: string,
  autoApprove: boolean,
  tokenLimit: TokenLimit,
  applyChangesCallback: (content: string) => Promise<void>
): void {
  const isNewReadme = currentContent === "";
  const panelTitle = isNewReadme ? 'Create New README' : 'README Update Preview';
  
  const panel = vscode.window.createWebviewPanel(
    'readmePreview',
    panelTitle,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  
  const differences = diff.diffLines(currentContent, update.suggestedReadmeContent);

  panel.webview.html = getWebviewContent(
    update.suggestedReadmeContent,
    differences,
    update.changeDescription,
    llmProvider,
    autoApprove,
    tokenLimit
  );
    
  panel.webview.onDidReceiveMessage(
    async message => {
      try {
        switch (message.command) {
          case 'apply':
            await applyChangesCallback(update.suggestedReadmeContent);
            vscode.window.showInformationMessage('README.md has been updated successfully!');
            panel.dispose();
            break;
            
          case 'applyEdited':
            await applyChangesCallback(message.content);
            vscode.window.showInformationMessage('README.md has been updated with your edits!');
            panel.dispose();
            break;
            
          case 'cancel':
            panel.dispose();
            break;
            
          case 'savePreference':
            if (message.autoApprove !== undefined) {
              await vscode.workspace.getConfiguration('readme-updater').update(
                'autoApprove', 
                message.autoApprove, 
                vscode.ConfigurationTarget.Global
              );
              vscode.window.showInformationMessage(
                message.autoApprove ? 
                  'Auto-approve enabled. Future README updates will be applied automatically.' : 
                  'Auto-approve disabled. You will be prompted for each README update.'
              );
            }
            
            if (message.tokenLimit) {
              await vscode.workspace.getConfiguration('readme-updater').update(
                'tokenLimit', 
                message.tokenLimit, 
                vscode.ConfigurationTarget.Global
              );
              vscode.window.showInformationMessage(`README size preference set to: ${message.tokenLimit}`);
            }
            break;
        }
      } catch (error) {
        vscode.window.showErrorMessage('Error: ' + (error instanceof Error ? error.message : String(error)));
      }
    }
  );
}

function getWebviewContent(
  suggestedContent: string,
  differences: diff.Change[],
  changeDescription: string,
  llmProvider: string,
  autoApprove: boolean,
  tokenLimit: TokenLimit
): string {
  let diffHtml = '';
  
  differences.forEach(part => {
    const color = part.added ? 'green' : part.removed ? 'red' : 'grey';
    const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
    const lines = part.value.split('\n').filter(line => line.trim() !== '');
    
    lines.forEach(line => {
      diffHtml += `<div style="color: ${color};">${prefix}${escapeHtml(line)}</div>`;
    });
  });
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>README Update Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            margin: 0;
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .header {
            margin-bottom: 20px;
            background-color: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .tabs {
            display: flex;
            margin-bottom: 10px;
            background-color: var(--vscode-tab-inactiveBackground);
            border-radius: 6px 6px 0 0;
            overflow: hidden;
        }
        .tab {
            padding: 10px 20px;
            cursor: pointer;
            background-color: var(--vscode-tab-inactiveBackground);
            color: var(--vscode-tab-inactiveForeground);
            border: none;
            margin-right: 1px;
            transition: background-color 0.2s;
        }
        .tab:hover {
            background-color: var(--vscode-tab-hoverBackground);
        }
        .tab.active {
            background-color: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
            border-bottom: 2px solid var(--vscode-activityBarBadge-background);
        }
        .tab-content {
            display: none;
            flex: 1;
            overflow: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 0 0 6px 6px;
            padding: 15px;
            background-color: var(--vscode-editor-background);
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }
        .tab-content.active {
            display: block;
        }
        .diff-view {
            font-family: monospace;
            white-space: pre;
            line-height: 1.5;
            overflow: auto;
            padding: 10px;
            border-radius: 4px;
            background-color: var(--vscode-textCodeBlock-background);
        }
        .markdown-content {
            overflow: auto;
            line-height: 1.6;
            padding: 10px;
        }
        .edit-area {
            height: 100%;
            width: 100%;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 15px;
            font-family: monospace;
            resize: none;
            border-radius: 4px;
        }
        .actions {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .right-actions {
            display: flex;
        }
        button {
            padding: 10px 18px;
            margin-left: 10px;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .llm-info {
            font-style: italic;
            margin-bottom: 15px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            background-color: var(--vscode-activityBarBadge-background);
            color: var(--vscode-activityBarBadge-foreground);
        }
        .change-description {
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 5px solid var(--vscode-focusBorder);
            border-radius: 0 4px 4px 0;
        }
        .preferences {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 15px;
        }
        .preference-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .checkbox-container {
            display: flex;
            align-items: center;
            margin-right: 10px;
        }
        .checkbox-container input {
            margin-right: 5px;
        }
        select {
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-dropdown-border);
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
        }
        h2, h3 {
            margin-top: 0;
            color: var(--vscode-titleBar-activeForeground);
        }
        .separator {
            height: 1px;
            background-color: var(--vscode-input-border);
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>README Update Preview</h2>
            <div class="llm-info">
                Generated by <span class="badge">${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)}</span>
                <span class="badge">Size: ${tokenLimit.charAt(0).toUpperCase() + tokenLimit.slice(1)}</span>
            </div>
            <div class="change-description">
                <h3>Suggested Changes:</h3>
                <p>${changeDescription}</p>
            </div>
        </div>
        
        <div class="tabs">
            <button class="tab active" id="diffTab">Diff View</button>
            <button class="tab" id="originalTab">Original</button>
            <button class="tab" id="previewTab">Preview</button>
            <button class="tab" id="editTab">Edit</button>
        </div>
        
        <div id="diff" class="tab-content active">
            <div class="diff-view">${diffHtml}</div>
        </div>
        
        <div id="preview" class="tab-content">
            <div class="markdown-content">${markdownToHtml(suggestedContent)}</div>
        </div>
        
        <div id="edit" class="tab-content">
            <textarea class="edit-area" id="editContent">${escapeHtml(suggestedContent)}</textarea>
        </div>
        
        <div class="actions">
            <div class="preferences">
                <div class="preference-group">
                    <div class="checkbox-container">
                        <input type="checkbox" id="autoApprove" ${autoApprove ? 'checked' : ''}>
                        <label for="autoApprove">Auto-approve future updates</label>
                    </div>
                </div>
                
                <div class="preference-group">
                    <label for="tokenLimit">README Size:</label>
                    <select id="tokenLimit">
                        <option value="small" ${tokenLimit === 'small' ? 'selected' : ''}>Small (Concise)</option>
                        <option value="medium" ${tokenLimit === 'medium' ? 'selected' : ''}>Medium (Balanced)</option>
                        <option value="large" ${tokenLimit === 'large' ? 'selected' : ''}>Large (Comprehensive)</option>
                    </select>
                </div>
            </div>
            
            <div class="right-actions">
                <button class="secondary" id="cancelBtn">Cancel</button>
                <button class="secondary" id="applyEditedBtn">Apply with Edits</button>
                <button id="applyBtn">Apply Changes</button>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('diffTab').addEventListener('click', () => showTab('diff'));
        document.getElementById('originalTab').addEventListener('click', () => showTab('original'));
        document.getElementById('previewTab').addEventListener('click', () => showTab('preview'));
        document.getElementById('editTab').addEventListener('click', () => showTab('edit'));
        
        document.getElementById('cancelBtn').addEventListener('click', cancel);
        document.getElementById('applyEditedBtn').addEventListener('click', applyEdited);
        document.getElementById('applyBtn').addEventListener('click', apply);
        
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');
        }
        
        function apply() {
            vscode.postMessage({
                command: 'apply'
            });
            
            savePreferences();
        }
        
        function applyEdited() {
            const editedContent = document.getElementById('editContent').value;
            vscode.postMessage({
                command: 'applyEdited',
                content: editedContent
            });
            
            savePreferences();
        }
        
        function cancel() {
            vscode.postMessage({
                command: 'cancel'
            });
            
            savePreferences();
        }
        
        function savePreferences() {
            const autoApprove = document.getElementById('autoApprove').checked;
            const tokenLimit = document.getElementById('tokenLimit').value;
            
            vscode.postMessage({
                command: 'savePreference',
                autoApprove: autoApprove,
                tokenLimit: tokenLimit
            });
        }
    </script>
</body>
</html>`;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
    .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/^\- (.*$)/gm, '<li>$1</li>')
    .replace(/^\+ (.*$)/gm, '<li>$1</li>')
    .replace(/^\* (.*$)/gm, '<li>$1</li>')
    .replace(/\n/g, '<br />');
}