import defaults from '../../config/defaults.json';
import type { ConfigurationOptions } from './configuration.mjs';
export function readRuntimeConfig(options?: ConfigurationOptions): typeof defaults.runtime;
