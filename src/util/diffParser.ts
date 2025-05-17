import * as diff from 'diff';

export interface ParsedDiff {
  addedLines: number;
  removedLines: number;
  changedFiles: string[];
  significantChanges: boolean;
}

export function parseDiffContent(diffContent: string): ParsedDiff {
  const lines = diffContent.split('\n');
  let addedLines = 0;
  let removedLines = 0;
  const changedFiles = new Set<string>();
  
  let currentFile = '';
  
  lines.forEach(line => {
    const fileMatch = line.match(/^File: (.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      changedFiles.add(currentFile);
      return;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines++;
    }
  });
  const significantChanges = (addedLines + removedLines > 10) || (changedFiles.size > 3);
  
  return {
    addedLines,
    removedLines,
    changedFiles: Array.from(changedFiles),
    significantChanges
  };
}

export function generateDiffSummary(diffContent: string): string {
  const parsed = parseDiffContent(diffContent);
  
  let summary = `Changes summary:
- ${parsed.addedLines} lines added
- ${parsed.removedLines} lines removed
- ${parsed.changedFiles.length} files changed`;

  if (parsed.changedFiles.length <= 10) {
    summary += `\n\nModified files:\n${parsed.changedFiles.map(file => `- ${file}`).join('\n')}`;
  }
  
  return summary;
}