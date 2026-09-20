import type { Server } from 'node:http';
import type { SeerHttpHandlerOptions } from './index.js';

export interface SeerHttpServerOptions extends SeerHttpHandlerOptions {
  host?: string;
  port?: string | number;
}
export function createSeerHttpServer(options?: SeerHttpServerOptions): Server;
export function listen(options?: SeerHttpServerOptions): Promise<Server>;
