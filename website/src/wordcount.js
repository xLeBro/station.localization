const fs = require('node:fs/promises');
const path = require('node:path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const config = require('./config');

function countWords(text) {
  const tokens = String(text).split(/\s+/);
  return tokens.filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

function stripHtml(html) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

// Subtitle files: drop cue numbers and timestamps.
function stripSrt(srt) {
  return srt
    .split(/\r?\n/)
    .filter((line) => !/^\d+$/.test(line.trim()) && !/-->/.test(line))
    .join('\n');
}

// Returns the word count for a file, or null when it can't be read automatically.
async function countFileWords(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (!config.uploads.countable.includes(ext)) return null;
  try {
    if (ext === '.docx') {
      const { value } = await mammoth.extractRawText({ path: filePath });
      return countWords(value);
    }
    if (ext === '.pdf') {
      const { text } = await pdfParse(await fs.readFile(filePath));
      const n = countWords(text);
      return n > 0 ? n : null; // scanned PDF without a text layer
    }
    const text = await fs.readFile(filePath, 'utf8');
    if (ext === '.html' || ext === '.htm') return countWords(stripHtml(text));
    if (ext === '.srt') return countWords(stripSrt(text));
    return countWords(text);
  } catch {
    return null;
  }
}

module.exports = { countWords, countFileWords };
