import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import * as path from 'path';
import * as fs from 'fs';

export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
}

export interface Commit {
  sha: string;
  message: string;
  date: string;
  author: string;
}

export async function getRepoInfo(): Promise<RepoInfo | undefined> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const gitConfigPath = path.join(workspaceRoot, '.git', 'config');
    
    if (!fs.existsSync(gitConfigPath)) {
      throw new Error('Not a git repository');
    }
    
    const gitConfig = fs.readFileSync(gitConfigPath, 'utf8');
    const remoteUrlMatch = gitConfig.match(/\[remote "origin"\][\s\S]*?url = .*?github\.com[:/](.*?)\/(.*?)(?:\.git)?$/m);
    
    if (!remoteUrlMatch) {
      throw new Error('Could not find GitHub remote URL');
    }
    
    const owner = remoteUrlMatch[1];
    const repo = remoteUrlMatch[2].replace('.git', '');
    
    const headPath = path.join(workspaceRoot, '.git', 'HEAD');
    const headContent = fs.readFileSync(headPath, 'utf8');
    const branchMatch = headContent.match(/ref: refs\/heads\/(.*)/);
    const branch = branchMatch ? branchMatch[1] : 'main';
    
    return { owner, repo, branch };
  } catch (error) {
    console.error('Error getting repo info:', error);
    vscode.window.showErrorMessage('Error getting repository information: ' + (error as Error).message);
    return undefined;
  }
}

export async function getCommitHistory(count: number = 10): Promise<Commit[]> {
  try {
    const config = vscode.workspace.getConfiguration('readme-updater');
    const token = config.get('githubToken') as string;
    
    if (!token) {
      throw new Error('GitHub token not configured');
    }
    
    const repoInfo = await getRepoInfo();
    if (!repoInfo) {
      throw new Error('Could not determine repository information');
    }
    
    const octokit = new Octokit({ auth: token });
    
    try {
      const response = await octokit.repos.listCommits({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        sha: repoInfo.branch,
        per_page: count
      });
      
      return response.data.map(item => ({
        sha: item.sha,
        message: item.commit.message,
        date: item.commit.author?.date || '',
        author: item.commit.author?.name || ''
      }));
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error('Cannot access repository. If this is a private repository, please ensure your GitHub token has the correct permissions (repo scope).');
      }
      throw error;
    }
  } catch (error) {
    console.error('Error fetching commit history:', error);
    vscode.window.showErrorMessage('Error fetching commit history: ' + (error as Error).message);
    return [];
  }
}

export async function getFileDiff(fromCommit: string, toCommit: string, filePath: string = 'README.md'): Promise<string> {
  try {
    const config = vscode.workspace.getConfiguration('readme-updater');
    const token = config.get('githubToken') as string;
    
    if (!token) {
      throw new Error('GitHub token not configured');
    }
    
    const repoInfo = await getRepoInfo();
    if (!repoInfo) {
      throw new Error('Could not determine repository information');
    }
    
    const octokit = new Octokit({ auth: token });
    
    const response = await octokit.repos.compareCommits({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      base: fromCommit,
      head: toCommit
    });

    const fileChanges = response.data.files?.filter(file => file.filename === filePath);
    
    if (!fileChanges || fileChanges.length === 0) {
      return "No README changes found between these commits.";
    }
    
    return fileChanges[0].patch || "Diff information not available";
  } catch (error) {
    console.error('Error getting file diff:', error);
    vscode.window.showErrorMessage('Error getting file diff: ' + (error as Error).message);
    return '';
  }
}

export async function getReadmeContent(): Promise<string | undefined> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const readmePath = path.join(workspaceRoot, 'README.md');
    
    if (!fs.existsSync(readmePath)) {
      throw new Error('README.md not found in workspace root');
    }
    
    return fs.readFileSync(readmePath, 'utf8');
  } catch (error) {
    console.error('Error reading README:', error);
    vscode.window.showErrorMessage('Error reading README: ' + (error as Error).message);
    return undefined;
  }
}

export async function getCodeChanges(fromCommit: string, toCommit: string): Promise<string> {
  try {
    const config = vscode.workspace.getConfiguration('readme-updater');
    const token = config.get('githubToken') as string;
    
    if (!token) {
      throw new Error('GitHub token not configured');
    }
    
    const repoInfo = await getRepoInfo();
    if (!repoInfo) {
      throw new Error('Could not determine repository information');
    }
    
    const octokit = new Octokit({ auth: token });
    
    const response = await octokit.repos.compareCommits({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      base: fromCommit,
      head: toCommit
    });
    
    let changes = '';
    
    response.data.files?.forEach(file => {
      if (file.filename !== 'README.md') {
        changes += `File: ${file.filename}\n`;
        changes += `Status: ${file.status}\n`;
        if (file.patch) {
          changes += `Changes:\n${file.patch}\n\n`;
        }
      }
    });
    
    return changes || "No code changes found between these commits.";
  } catch (error) {
    console.error('Error getting code changes:', error);
    vscode.window.showErrorMessage('Error getting code changes: ' + (error as Error).message);
    return '';
  }
}