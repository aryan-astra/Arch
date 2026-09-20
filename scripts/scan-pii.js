#!/usr/bin/env node

/**
 * PII Pattern Detection Script
 * 
 * Scans the codebase for personally identifiable information patterns
 * that should never be committed to version control.
 * 
 * Usage: node scripts/scan-pii.js
 * Exit code: 0 = no PII found, 1 = PII detected
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'dev-dist',
  '.next',
  'build',
  'coverage',
  '.vscode',
  '.idea',
];

// PII Patterns to detect
const PATTERNS = [
  // Indian phone numbers (10 digits, common patterns)
  { regex: /\b[6-9]\d{9}\b/g, name: 'Indian Phone Number', severity: 'high' },
  
  // SRM Registration numbers (RAxxxxxxxxxxxx)
  { regex: /\bRA\d{13,15}\b/g, name: 'SRM Registration Number', severity: 'high' },
  
  // Personal emails
  { regex: /\b[a-z0-9._%+-]+@srmist\.edu\.in\b/gi, name: 'SRM Email', severity: 'medium' },
  
  // Common Indian advisor names/patterns (Dr. followed by name)
  { regex: /Dr\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g, name: 'Potential Advisor Name', severity: 'medium' },
];

const WHITELIST = [
  'sb7092', // Test user
  'as6977', // Admin user  
  'ABC123@rupsou', // Test password
  'vidhyas2@srmist.edu.in', // Public advisor email in documentation
  'priyas3@srmist.edu.in', // Public advisor email in documentation
];

const EXCLUDED_FILES = [
  'scan-pii.js',
  // HAR captures are gitignored local debug artifacts (*.har in .gitignore).
  // They intentionally contain real upstream payloads, so content-scanning
  // them only produces noise. Tracking protection is enforced separately via
  // `git ls-files | findstr .har` (must be empty) — see readme/hosting.md.
  '.har',
  'test-',
  '.md',
];

let issuesFound = 0;

function shouldIgnore(filePath) {
  const relativePath = path.relative(REPO_ROOT, filePath);
  
  // Ignore node_modules, dist, etc
  if (IGNORE_DIRS.some(dir => relativePath.includes(dir))) return true;
  
  // Ignore test files
  if (EXCLUDED_FILES.some(exclude => relativePath.includes(exclude))) return true;
  
  return false;
}

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    PATTERNS.forEach(pattern => {
      const matches = [...content.matchAll(pattern.regex)];
      
      matches.forEach(match => {
        // Skip whitelist
        if (WHITELIST.some(w => match[0].includes(w))) {
          return;
        }
        
        const lineNum = content.substring(0, match.index).split('\n').length;
        console.error(`❌ [${pattern.severity.toUpperCase()}] ${pattern.name}`);
        console.error(`   File: ${path.relative(REPO_ROOT, filePath)}`);
        console.error(`   Line: ${lineNum}`);
        console.error(`   Match: ${match[0]}`);
        console.error();
        issuesFound++;
      });
    });
  } catch (error) {
    // Skip binary files
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (shouldIgnore(filePath)) {
      return;
    }
    
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (stat.isFile()) {
      scanFile(filePath);
    }
  });
}

console.log('🔍 Scanning repository for PII patterns...\n');
walkDir(REPO_ROOT);

if (issuesFound > 0) {
  console.error(`\n❌ Found ${issuesFound} potential PII issue(s)`);
  process.exit(1);
} else {
  console.log('✅ No PII patterns detected\n');
  process.exit(0);
}
