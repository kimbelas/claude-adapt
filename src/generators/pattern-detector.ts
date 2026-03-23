/**
 * Architectural pattern detector.
 *
 * Scans the FileIndex for well-known structural patterns
 * (service-repository, barrel exports, MVC, custom errors,
 * middleware) and returns a list of detected patterns with
 * descriptions and example files.
 */

import type { FileIndex, FileEntry } from '../core/context/file-index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedPattern {
  /** Short machine-friendly name, e.g. "service-repository". */
  name: string;
  /** Human-readable explanation of the pattern and how to follow it. */
  description: string;
  /** Representative files that evidence the pattern. */
  files: string[];
}

// ---------------------------------------------------------------------------
// Individual detectors
// ---------------------------------------------------------------------------

function detectServiceRepository(fileIndex: FileIndex): DetectedPattern | null {
  const services = fileIndex.glob('**/services/**');
  const repositories = fileIndex.glob('**/repositories/**');

  if (services.length > 0 && repositories.length > 0) {
    return {
      name: 'Service-Repository Pattern',
      description:
        'Business logic lives in services/, data access in repositories/. ' +
        'Never access the database directly from services — always go through repos.',
      files: [
        ...services.slice(0, 3).map((e) => e.relativePath),
        ...repositories.slice(0, 3).map((e) => e.relativePath),
      ],
    };
  }
  return null;
}

function detectBarrelExports(fileIndex: FileIndex): DetectedPattern | null {
  const barrels: FileEntry[] = [
    ...fileIndex.glob('**/index.ts'),
    ...fileIndex.glob('**/index.js'),
  ];

  if (barrels.length > 5) {
    return {
      name: 'Barrel Exports',
      description:
        'This project uses barrel exports (index.ts/js files). ' +
        'When adding new modules, always re-export from the nearest index file.',
      files: barrels.slice(0, 5).map((e) => e.relativePath),
    };
  }
  return null;
}

function detectCustomErrors(fileIndex: FileIndex): DetectedPattern | null {
  const errorFiles: FileEntry[] = [
    ...fileIndex.glob('**/*error*'),
    ...fileIndex.glob('**/*exception*'),
    ...fileIndex.glob('**/*Error*'),
    ...fileIndex.glob('**/*Exception*'),
  ];

  // Deduplicate by relative path
  const unique = [...new Map(errorFiles.map((e) => [e.relativePath, e])).values()];

  // Filter out test files and node_modules references
  const relevant = unique.filter(
    (e) =>
      !e.relativePath.includes('__tests__') &&
      !e.relativePath.includes('.test.') &&
      !e.relativePath.includes('.spec.') &&
      !e.relativePath.includes('node_modules'),
  );

  if (relevant.length > 0) {
    return {
      name: 'Custom Error Classes',
      description:
        'Project uses custom error classes. Extend from the base error ' +
        'class rather than throwing raw Error objects.',
      files: relevant.slice(0, 5).map((e) => e.relativePath),
    };
  }
  return null;
}

function detectMVC(fileIndex: FileIndex): DetectedPattern | null {
  const controllers = fileIndex.glob('**/controllers/**');
  const models = fileIndex.glob('**/models/**');
  const views = [
    ...fileIndex.glob('**/views/**'),
    ...fileIndex.glob('**/templates/**'),
  ];

  if (controllers.length > 0 && models.length > 0 && views.length > 0) {
    return {
      name: 'MVC Pattern',
      description:
        'This project follows the Model-View-Controller pattern. ' +
        'Controllers handle HTTP requests, models define data structures, ' +
        'views handle presentation. Keep business logic out of controllers.',
      files: [
        ...controllers.slice(0, 2).map((e) => e.relativePath),
        ...models.slice(0, 2).map((e) => e.relativePath),
        ...views.slice(0, 2).map((e) => e.relativePath),
      ],
    };
  }
  return null;
}

function detectMiddleware(fileIndex: FileIndex): DetectedPattern | null {
  const middleware = [
    ...fileIndex.glob('**/middleware/**'),
    ...fileIndex.glob('**/middlewares/**'),
  ];

  if (middleware.length > 0) {
    return {
      name: 'Middleware Pattern',
      description:
        'Request processing uses a middleware chain. ' +
        'Middleware files handle cross-cutting concerns like auth, logging, and validation. ' +
        'New middleware should follow the existing signature and be registered in the correct order.',
      files: middleware.slice(0, 5).map((e) => e.relativePath),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs all pattern detectors against the file index and returns
 * an array of detected architectural patterns.
 */
export function detectPatterns(fileIndex: FileIndex): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const detectors = [
    detectServiceRepository,
    detectBarrelExports,
    detectCustomErrors,
    detectMVC,
    detectMiddleware,
  ];

  for (const detector of detectors) {
    const result = detector(fileIndex);
    if (result) {
      patterns.push(result);
    }
  }

  return patterns;
}
