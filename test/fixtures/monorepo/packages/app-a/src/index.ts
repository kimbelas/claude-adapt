/**
 * App A - Primary application entry point.
 *
 * Depends on shared utilities from app-b.
 */

import { greet } from "@monorepo/app-b";

export interface AppConfig {
  name: string;
  port: number;
  debug: boolean;
}

const defaultConfig: AppConfig = {
  name: "app-a",
  port: 3000,
  debug: false,
};

export function startApp(config: Partial<AppConfig> = {}): void {
  const mergedConfig: AppConfig = { ...defaultConfig, ...config };
  const message = greet(mergedConfig.name);
  console.log(message);
  console.log(`Starting ${mergedConfig.name} on port ${mergedConfig.port}`);
}

export { defaultConfig };
