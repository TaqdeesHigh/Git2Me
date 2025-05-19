# Git2Me

A VS Code extension that automatically updates your README.md based on code changes between commits using AI.

## Features

- Automatically analyzes code changes between commits
- Uses AI (Claude, ChatGPT, or Gemini) to suggest README updates
- Shows a diff view to preview changes before applying
- Supports user editing of suggested changes
- Provides options for auto-approving future updates
- Generates a new README.md file if one doesn't exist
- Token Limit Usage Options (Low, Medium, High) selectable from extension settings

## Requirements

- GitHub repository with commit history
- API key for at least one AI service:
  - Anthropic Claude (recommended)
  - OpenAI ChatGPT
  - Google Gemini

## Installation

1. Install the extension from the VS Code marketplace
2. Configure your API keys in VS Code settings
3. Click the "Update README" button in the status bar or run the "Update README from Commits" command

## Setup

You'll need to configure the following settings:

1. **GitHub Token**: A personal access token with `repo` scope (required)
2. **LLM API Key**: At least one of the following:
   - `readme-updater.anthropicApiKey` for Claude (recommended)
   - `readme-updater.openaiApiKey` for ChatGPT
   - `readme-updater.geminiApiKey` for Gemini
3. **Preferred LLM**: Select your preferred AI service
4. **Token Limit Usage**: Select your preferred token limit (small, medium, large)

## Usage

1. Open a repository with a README.md file
2. Click the "Update README" button in the status bar or run the command
3. If no README.md exists, you will be prompted to generate a new one.
4. If a README.md exists, select the latest commit and an older commit to compare
5. The extension will analyze changes and suggest README updates
6. Review the changes in the diff view
7. Apply the changes as-is, or edit them before applying

## Extension Settings

* `readme-updater.githubToken`: GitHub Personal Access Token (required)
* `readme-updater.anthropicApiKey`: Anthropic API Key for Claude
* `readme-updater.openaiApiKey`: OpenAI API Key for ChatGPT  
* `readme-updater.geminiApiKey`: Google API Key for Gemini
* `readme-updater.preferredLlm`: Preferred LLM service (claude, chatgpt, gemini)
* `readme-updater.tokenLimit`: Preferred token limit (small, medium, large)
* `readme-updater.autoApprove`: Automatically apply changes without preview

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.