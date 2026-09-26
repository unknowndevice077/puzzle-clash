import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@pc/shared';

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
