import * as vscode from 'vscode';
import * as diff from 'diff';

export function createPreviewPanel(
  currentContent: string,
  update: { suggestedReadmeContent: string, changeDescription: string },
  llmProvider: string,
  autoApprove: boolean,
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
    autoApprove
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
  autoApprove: boolean
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
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .header {
            margin-bottom: 20px;
        }
        .tabs {
            display: flex;
            margin-bottom: 10px;
        }
        .tab {
            padding: 8px 16px;
            cursor: pointer;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            margin-right: 5px;
        }
        .tab.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .tab-content {
            display: none;
            flex: 1;
            overflow: auto;
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
            background-color: var(--vscode-editor-background);
        }
        .tab-content.active {
            display: block;
        }
        .diff-view {
            font-family: monospace;
            white-space: pre;
            line-height: 1.5;
            overflow: auto;
        }
        .markdown-content {
            overflow: auto;
            line-height: 1.6;
        }
        .edit-area {
            height: 100%;
            width: 100%;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 10px;
            font-family: monospace;
            resize: none;
        }
        .actions {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
        }
        .right-actions {
            display: flex;
        }
        button {
            padding: 8px 16px;
            margin-left: 10px;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .llm-info {
            font-style: italic;
            margin-bottom: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .change-description {
            margin-bottom: 20px;
            padding: 10px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 5px solid var(--vscode-focusBorder);
        }
        .preferences {
            display: flex;
            align-items: center;
        }
        .checkbox-container {
            display: flex;
            align-items: center;
            margin-right: 10px;
        }
        .checkbox-container input {
            margin-right: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>README Update Preview</h2>
            <div class="llm-info">Generated by ${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)}</div>
            <div class="change-description">
                <h3>Suggested Changes:</h3>
                <p>${changeDescription}</p>
            </div>
        </div>
        
        <div class="tabs">
            <button class="tab active" onclick="showTab('diff')">Diff View</button>
            <button class="tab" onclick="showTab('original')">Original</button>
            <button class="tab" onclick="showTab('preview')">Preview</button>
            <button class="tab" onclick="showTab('edit')">Edit</button>
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
                <div class="checkbox-container">
                    <input type="checkbox" id="autoApprove" ${autoApprove ? 'checked' : ''}>
                    <label for="autoApprove">Auto-approve future updates</label>
                </div>
                <button class="secondary" onclick="savePreferences()">Save Preference</button>
            </div>
            <div class="right-actions">
                <button class="secondary" onclick="cancel()">Cancel</button>
                <button onclick="applyOriginal()">Apply Changes</button>
                <button onclick="applyEdited()">Apply Edited Version</button>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function showTab(tabId) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(element => {
                element.classList.remove('active');
            });
            
            // Deactivate all tabs
            document.querySelectorAll('.tab').forEach(element => {
                element.classList.remove('active');
            });
            
            // Show the selected tab content
            document.getElementById(tabId).classList.add('active');
            
            // Activate the clicked tab
            event.target.classList.add('active');
        }
        
        function applyOriginal() {
            vscode.postMessage({
                command: 'apply'
            });
        }
        
        function applyEdited() {
            const editedContent = document.getElementById('editContent').value;
            vscode.postMessage({
                command: 'applyEdited',
                content: editedContent
            });
        }
        
        function cancel() {
            vscode.postMessage({
                command: 'cancel'
            });
        }
        
        function savePreferences() {
            const autoApprove = document.getElementById('autoApprove').checked;
            vscode.postMessage({
                command: 'savePreference',
                autoApprove: autoApprove
            });
        }
    </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function markdownToHtml(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.*?)$/gm, '<h4>$1</h4>')
    .replace(/^##### (.*?)$/gm, '<h5>$1</h5>')
    .replace(/^###### (.*?)$/gm, '<h6>$1</h6>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\`\`\`(.*?)\`\`\`/gs, '<pre><code>$1</code></pre>')
    .replace(/\`(.*?)\`/g, '<code>$1</code>')
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>');
}