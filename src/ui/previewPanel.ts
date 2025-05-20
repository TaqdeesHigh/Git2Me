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

  panel.webview.html = getWebviewContent(
    currentContent,
    update.suggestedReadmeContent,
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
              await vscode.workspace.getConfiguration('git2me').update(
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
              await vscode.workspace.getConfiguration('git2me').update(
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
  originalContent: string,
  suggestedContent: string,
  changeDescription: string,
  llmProvider: string,
  autoApprove: boolean,
  tokenLimit: TokenLimit
): string {
  const changes = generateDiffChanges(originalContent, suggestedContent);
const isNewReadme = originalContent === "";
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>README Update Preview</title>
    <style>
        :root {
            --border-radius: 6px;
            --animation-duration: 0.2s;
        }
        
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
            background-color: var(--vscode-editor-background);
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        .header {
            padding: 20px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header-title {
            margin-top: 0;
            margin-bottom: 16px;
            color: var(--vscode-titleBar-activeForeground);
            font-weight: 500;
            font-size: 1.5rem;
        }
        
        .metadata {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 18px;
        }
        
        .metadata-item {
            display: flex;
            align-items: center;
            font-size: 13px;
            padding: 4px 12px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            gap: 6px;
        }
        
        .metadata-item svg {
            width: 16px;
            height: 16px;
        }
        
        .change-description {
            margin-top: 16px;
            padding: 16px;
            background-color: var(--vscode-editor-background);
            border-radius: var(--border-radius);
            border: 1px solid var(--vscode-panel-border);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .change-description h3 {
            margin-top: 0;
            margin-bottom: 12px;
            color: var(--vscode-editor-foreground);
            font-size: 1rem;
        }

        .change-description-content {
            white-space: pre-wrap;
            padding: 16px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            overflow-y: auto;
            max-height: 200px;
            line-height: 1.5;
        }

                .change-description-content h1,
        .change-description-content h2,
        .change-description-content h3,
        .change-description-content h4,
        .change-description-content h5,
        .change-description-content h6 {
            color: var(--vscode-foreground);
            margin-top: 16px;
            margin-bottom: 8px;
        }
        
        .change-description-content h1 { font-size: 1.6em; }
        .change-description-content h2 { font-size: 1.4em; }
        .change-description-content h3 { font-size: 1.2em; }
        
        .change-description-content p {
            margin: 8px 0;
        }
        
        .change-description-content ul,
        .change-description-content ol {
            padding-left: 20px;
            margin: 8px 0;
        }
        
        .change-description-content li {
            margin: 4px 0;
        }
        
        .change-description-content code {
            background-color: rgba(127, 127, 127, 0.1);
            border-radius: 3px;
            padding: 2px 4px;
            font-family: var(--vscode-editor-font-family);
        }
        
        .change-description-content .code-block {
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 4px;
            padding: 12px;
            margin: 12px 0;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            white-space: pre;
        }
        
        .tabs {
            display: flex;
            background-color: var(--vscode-tab-inactiveBackground);
            padding: 0 20px;
            height: 46px;
            align-items: flex-end;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .tab {
            padding: 10px 18px;
            cursor: pointer;
            background-color: var(--vscode-tab-inactiveBackground);
            color: var(--vscode-tab-inactiveForeground);
            border: none;
            height: 40px;
            margin-right: 4px;
            border-radius: 6px 6px 0 0;
            transition: background-color var(--animation-duration), color var(--animation-duration);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .tab svg {
            width: 16px;
            height: 16px;
        }
        
        .tab:hover {
            background-color: var(--vscode-tab-hoverBackground);
        }
        
        .tab.active {
            background-color: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
            border-bottom: 2px solid var(--vscode-activityBarBadge-background);
            height: 42px;
            font-weight: 500;
        }
        
        .content-container {
            flex: 1;
            overflow: hidden;
            position: relative;
        }
        
        .tab-content {
            display: none;
            height: 100%;
            overflow: auto;
            background-color: var(--vscode-editor-background);
        }
        
        .tab-content.active {
            display: flex;
        }
        
        .diff-line-content {
            flex-grow: 1;
            padding: 2px 0;
            font-family: var(--vscode-editor-font-family);
        }
        
        /* Markdown syntax highlighting in diff view */
        .md-syntax {
            opacity: 0.6;
            color: var(--vscode-symbolIcon-operatorForeground, #d4d4d4);
        }
        
        .md-heading {
            font-weight: bold;
            color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
        }
        
        .md-h1 { font-size: 1.2em; }
        
        .md-bold {
            font-weight: bold;
            color: var(--vscode-symbolIcon-constantForeground, #569cd6);
        }
        
        .md-italic {
            font-style: italic;
            color: var(--vscode-symbolIcon-variableForeground, #9cdcfe);
        }
        
        .md-code {
            background-color: rgba(127, 127, 127, 0.1);
            border-radius: 3px;
            padding: 0 2px;
            color: var(--vscode-textPreformat-foreground, #d7ba7d);
        }
        
        .md-link {
            color: var(--vscode-textLink-foreground, #3794ff);
        }
        
        .md-url {
            text-decoration: underline;
            opacity: 0.8;
        }
        
        .md-list-item {
            display: inline-block;
            width: 100%;
        }
            
        .split-view {
            display: flex;
            height: 100%;
            overflow: hidden;
            background-color: var(--vscode-editor-background);
        }
        
        .split-pane {
            flex: 1;
            overflow: auto;
            position: relative;
            border-right: 1px solid var(--vscode-panel-border);
            transition: box-shadow 0.3s ease;
        }
        
        .split-pane:last-child {
            border-right: none;
        }
        
        .split-pane:hover {
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1) inset;
        }
        
        .pane-title {
            position: sticky;
            top: 0;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            padding: 10px 20px;
            font-size: 13px;
            color: var(--vscode-tab-activeForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            z-index: 10;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            backdrop-filter: blur(5px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        
        .pane-title svg {
            width: 16px;
            height: 16px;
        }
        
        .pane-content {
            padding: 8px 0;
        }
        
        .markdown-content {
            line-height: 1.6;
            font-family: var(--vscode-font-family);
            padding: 20px;
        }
        
        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3,
        .markdown-content h4,
        .markdown-content h5,
        .markdown-content h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }
        
        .markdown-content h1:first-child,
        .markdown-content h2:first-child,
        .markdown-content h3:first-child {
            margin-top: 0;
        }
        
        .markdown-content p {
            margin-bottom: 16px;
        }
        
        .markdown-content pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 16px;
            border-radius: var(--border-radius);
            margin: 16px 0;
            overflow: auto;
        }
        
        .markdown-content code {
            font-family: var(--vscode-editor-font-family);
            padding: 2px 4px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 3px;
        }
        
        .markdown-content pre code {
            padding: 0;
            background-color: transparent;
        }
        
        .diff-line {
            padding: 0 12px 0 0;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            white-space: pre;
            display: flex;
            align-items: center;
        }
        
        .diff-content {
            padding: 4px 0;
        }
        
        .line-number {
            user-select: none;
            text-align: right;
            color: var(--vscode-editorLineNumber-foreground);
            padding: 0 12px;
            min-width: 40px;
            border-right: 1px solid var(--vscode-panel-border);
            margin-right: 12px;
        }
        
        .diff-line-content {
            flex-grow: 1;
            padding: 2px 0;
        }
        
        .diff-line-added {
            background-color: rgba(80, 200, 120, 0.2);
            border-left: 3px solid #73c991;
        }
        
        .diff-line-removed {
            background-color: rgba(200, 80, 80, 0.2);
            border-left: 3px solid #f14c4c;
        }
        
        .diff-line-modified {
            background-color: rgba(200, 180, 80, 0.2);
            border-left: 3px solid #e2c08d;
        }
        
        .edit-area {
            height: 100%;
            width: 100%;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: none;
            padding: 20px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            resize: none;
            outline: none;
        }
        
        .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 20px;
            background-color: var(--vscode-sideBar-background);
            border-top: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .preferences {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 20px;
        }
        
        .preference-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .preference-group label {
            font-size: 13px;
            user-select: none;
        }
        
        .switch {
            position: relative;
            display: inline-block;
            width: 36px;
            height: 20px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-checkbox-background);
            transition: .3s;
            border-radius: 20px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: var(--vscode-checkbox-foreground);
            transition: .3s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: var(--vscode-activityBarBadge-background);
        }
        
        input:checked + .slider:before {
            transform: translateX(16px);
        }
        
        select {
            padding: 6px 12px;
            border-radius: var(--border-radius);
            border: 1px solid var(--vscode-dropdown-border);
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            outline: none;
            font-size: 13px;
        }
        
        .actions {
            display: flex;
            gap: 12px;
        }
        
        button {
            padding: 8px 16px;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: var(--border-radius);
            transition: background-color var(--animation-duration);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 100px;
            justify-content: center;
        }
        
        button svg {
            width: 16px;
            height: 16px;
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <h2 class="header-title">${isNewReadme ? 'Create New README' : 'README Update Preview'}</h2>
                <div class="metadata">
                    <div class="metadata-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" />
                        </svg>
                        ${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)}
                    </div>
                    <div class="metadata-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="16" rx="2" />
                            <path d="M7 8h10" />
                            <path d="M7 12h10" />
                            <path d="M7 16h10" />
                        </svg>
                        ${tokenLimit.charAt(0).toUpperCase() + tokenLimit.slice(1)} Size
                    </div>
                </div>
                <div class="change-description">
                    <h3>Suggested Changes:</h3>
                    <div class="change-description-content">${formatChangeDescription(changeDescription)}</div>
                </div>
            </div>
        </div>
        
        <div class="tabs">
            <button class="tab active" id="diffTab">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 18l4 -4l-4 -4" />
                    <path d="M8 6l-4 4l4 4" />
                    <path d="M20 14h-16" />
                    <path d="M4 10h16" />
                </svg>
                Split Diff
            </button>
            <button class="tab" id="previewTab">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
                    <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
                    <path d="M3 6l0 13" />
                    <path d="M12 6l0 13" />
                    <path d="M21 6l0 13" />
                </svg>
                Preview
            </button>
            <button class="tab" id="editTab">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 20h4l10.5 -10.5a1.5 1.5 0 0 0 -4 -4l-10.5 10.5v4" />
                    <path d="M13.5 6.5l4 4" />
                </svg>
                Edit
            </button>
        </div>
        
        <div class="content-container">
            <div id="diff" class="tab-content active">
                <div class="split-view">
                    <div class="split-pane">
                        <div class="pane-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 7v-2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v2" />
                                <path d="M17 8v-2a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v2" />
                                <path d="M7 10h-.01" />
                                <path d="M7 14h-.01" />
                                <path d="M11 12h-.01" />
                                <path d="M11 16h-.01" />
                                <path d="M15 14h-.01" />
                                <path d="M15 18h-.01" />
                                <rect x="3" y="8" width="18" height="14" rx="2" />
                            </svg>
                            Original
                        </div>
                        <div class="pane-content diff-content">
                            ${changes.original}
                        </div>
                    </div>
                    <div class="split-pane">
                        <div class="pane-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                                <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                            </svg>
                            Suggested
                        </div>
                        <div class="pane-content diff-content">
                            ${changes.suggested}
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="preview" class="tab-content">
                <div class="markdown-content">
                    ${renderMarkdown(suggestedContent)}
                </div>
            </div>
            
            <div id="edit" class="tab-content">
                <textarea class="edit-area" id="editContent">${escapeHtml(suggestedContent)}</textarea>
            </div>
        </div>
        
        <div class="footer">
            <div class="preferences">
                <div class="preference-group">
                    <label class="switch">
                        <input type="checkbox" id="autoApprove" ${autoApprove ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <label for="autoApprove">Auto-approve future updates</label>
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
            
            <div class="actions">
                <button class="secondary" id="cancelBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6l-12 12" />
                        <path d="M6 6l12 12" />
                    </svg>
                    Cancel
                </button>
                <button class="secondary" id="applyEditedBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                        <path d="M9 15l2 2l4 -4" />
                    </svg>
                    Apply with Edits
                </button>
                <button id="applyBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12l5 5l10 -10" />
                    </svg>
                    Apply Changes
                </button>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('diffTab').addEventListener('click', () => showTab('diff'));
        document.getElementById('previewTab').addEventListener('click', () => showTab('preview'));
        document.getElementById('editTab').addEventListener('click', () => showTab('edit'));
        
        document.getElementById('cancelBtn').addEventListener('click', cancel);
        document.getElementById('applyEditedBtn').addEventListener('click', applyEdited);
        document.getElementById('applyBtn').addEventListener('click', apply);
        
        document.querySelectorAll('pre code').forEach(block => {
            highlightSyntax(block);
        });

        const leftPane = document.querySelector('.split-pane:first-child');
        const rightPane = document.querySelector('.split-pane:last-child');
        
        if (leftPane && rightPane) {
            leftPane.addEventListener('scroll', () => {
                rightPane.scrollTop = leftPane.scrollTop;
            });
            
            rightPane.addEventListener('scroll', () => {
                leftPane.scrollTop = rightPane.scrollTop;
            });
        }
        
        function showTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
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
        
        function highlightSyntax(block) {
            const code = block.textContent;
            let highlighted = code
                .replace(/\\b(function|return|const|let|var|if|else|for|while|class|import|export)\\b/g, '<span style="color: var(--vscode-symbolIcon-keywordForeground, #569cd6)">$1</span>')
                .replace(/(['"])(.*?)\\1/g, '<span style="color: var(--vscode-symbolIcon-stringForeground, #ce9178)">$1$2$1</span>')
                .replace(/\\b(\\d+)\\b/g, '<span style="color: var(--vscode-symbolIcon-numberForeground, #b5cea8)">$1</span>');
                
            block.innerHTML = highlighted;
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

function formatMarkdownLine(line: string): string {
  let formatted = escapeHtml(line);

  formatted = formatted.replace(/^(#{1,6})\s+(.+)$/, (_, hashes, content) => {
    const level = hashes.length;
    return `<span class="md-heading md-h${level}"><span class="md-syntax">${hashes} </span>${content}</span>`;
  });
  
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<span class="md-bold"><span class="md-syntax">**</span>$1<span class="md-syntax">**</span></span>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<span class="md-italic"><span class="md-syntax">*</span>$1<span class="md-syntax">*</span></span>');
  formatted = formatted.replace(/`([^`]+)`/g, '<span class="md-code"><span class="md-syntax">`</span>$1<span class="md-syntax">`</span></span>');
  formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, 
    '<span class="md-link"><span class="md-syntax">[</span>$1<span class="md-syntax">]</span>' + 
    '<span class="md-syntax">(</span><span class="md-url">$2</span><span class="md-syntax">)</span></span>');
  formatted = formatted.replace(/^(\s*)(-|\*|\+|\d+\.)\s+(.+)$/, (_, space, bullet, content) => {
    return `${space}<span class="md-list-item"><span class="md-syntax">${bullet} </span>${content}</span>`;
  });
  
  return formatted;
}

function formatChangeDescription(description: string): string {
  if (!description) return '';

  let formatted = description.replace(/```(?:\w+)?\n([\s\S]*?)```/g, (_, code) => {
    return `<div class="code-block">${escapeHtml(code)}</div>`;
  });
  formatted = formatted.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, content) => {
    const level = hashes.length;
    return `<h${level} class="md-preview-heading">${content}</h${level}>`;
  });
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/^(\s*)(-|\*|\+)\s+(.+)$/gm, '$1<li>$3</li>');
  formatted = formatted.replace(/^(\s*)(\d+\.)\s+(.+)$/gm, '$1<li>$3</li>');
  let lines = formatted.split('\n');
  let inList = false;
  let result = [];
  
  for (let line of lines) {
    if (line.includes('<li>')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(line);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(line);
    }
  }
  
  if (inList) {
    result.push('</ul>');
  }
  
  formatted = result.join('\n');
  const paragraphs = formatted.split(/\n\n+/);
  formatted = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<div class="code-block">')) {
      return p;
    }
    return `<p>${p}</p>`;
  }).join('\n');
  
  return formatted;
}

function generateDiffChanges(originalContent: string, suggestedContent: string): { original: string, suggested: string } {
  if (!originalContent) {
    originalContent = '';
  }
  if (!suggestedContent) {
    suggestedContent = '';
  }
  
  const originalLines = originalContent.split('\n');
  const suggestedLines = suggestedContent.split('\n');
  const changes = diff.diffLines(originalContent, suggestedContent);
  
  let originalHtml = '';
  let suggestedHtml = '';
  let originalLineNumber = 1;
  let suggestedLineNumber = 1;
  changes.forEach(change => {
    const lines = change.value.split('\n');
    if (change.value[change.value.length - 1] !== '\n' && lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    lines.forEach((line) => {
      const formattedLine = formatMarkdownLine(line);
      
      if (change.added) {
        suggestedHtml += `<div class="diff-line diff-line-added">
          <div class="line-number">${suggestedLineNumber++}</div>
          <div class="diff-line-content">${formattedLine}</div>
        </div>`;
      } else if (change.removed) {
        originalHtml += `<div class="diff-line diff-line-removed">
          <div class="line-number">${originalLineNumber++}</div>
          <div class="diff-line-content">${formattedLine}</div>
        </div>`;
      } else {
        originalHtml += `<div class="diff-line">
          <div class="line-number">${originalLineNumber++}</div>
          <div class="diff-line-content">${formattedLine}</div>
        </div>`;
        
        suggestedHtml += `<div class="diff-line">
          <div class="line-number">${suggestedLineNumber++}</div>
          <div class="diff-line-content">${formattedLine}</div>
        </div>`;
      }
    });
  });

  if (!originalHtml) {
    originalHtml = '<div class="diff-line"><div class="line-number">1</div><div class="diff-line-content">Empty file</div></div>';
  }
  
  if (!suggestedHtml) {
    suggestedHtml = '<div class="diff-line"><div class="line-number">1</div><div class="diff-line-content">Empty file</div></div>';
  }
  
  return { original: originalHtml, suggested: suggestedHtml };
}

function renderMarkdown(markdown: string): string {
  if (!markdown) return '';
  
  let html = markdown;
  const codeBlocks: string[] = [];
  html = html.replace(/```(.*?)\n([\s\S]*?)```/g, (_codeBlockMatch, language, code) => {
    const id = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${language || 'text'}">${escapeHtml(code)}</code></pre>`);
    return `CODE_BLOCK_${id}`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
  html = html.replace(/^##### (.*$)/gm, '<h5>$1</h5>');
  html = html.replace(/^###### (.*$)/gm, '<h6>$1</h6>');
  html = html.replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/^(\s*)[\*\-\+] (.*$)/gm, '$1<li>$2</li>');
  html = html.replace(/^(\s*)\d+\. (.*$)/gm, '$1<li>$2</li>');
  let inList = false;
  let listIndent = '';
  const lines = html.split('\n');
  html = '';
  
  for (const line of lines) {
    const listMatch = line.match(/^(\s*)<li>/);
    
    if (listMatch) {
      const currentIndent = listMatch[1];
      
      if (!inList) {
        html += `${currentIndent}<ul>\n`;
        inList = true;
        listIndent = currentIndent;
      } else if (currentIndent !== listIndent) {
        if (currentIndent.length > listIndent.length) {
          html += `${listIndent}<ul>\n`;
          listIndent = currentIndent;
        } else {
          html += `${listIndent}</ul>\n`;
          listIndent = currentIndent;
        }
      }
      html += line + '\n';
    } else {
      if (inList) {
        html += `${listIndent}</ul>\n`;
        inList = false;
      }
      html += line + '\n';
    }
  }
  
  if (inList) {
    html += `${listIndent}</ul>\n`;
  }
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || 
        p.startsWith('<ul') || 
        p.startsWith('<blockquote') || 
        p.startsWith('<pre') ||
        p.startsWith('<hr')) {
      return p;
    }
    return `<p>${p}</p>`;
  }).join('\n\n');
  html = html.replace(/CODE_BLOCK_(\d+)/g, (_blockRef, id) => {
    return codeBlocks[parseInt(id)];
  });
  
  return html;
}