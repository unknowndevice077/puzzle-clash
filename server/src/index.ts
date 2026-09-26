import { createServer } from 'node:http';
import { config } from './config';
import { Store } from './db';
import { Lobby } from './game/Lobby';
import { createApp } from './http';
import { PhotoLibrary } from './photos';
import { attachSockets, createIo } from './socket';
import { errMessage, log } from './util/misc';

async function main(): Promise<void> {
  const store = new Store();
  const photos = new PhotoLibrary();
  await photos.load();

  const http = createServer();
  const io = createIo(http);
  const lobby = new Lobby(io, store, photos);
  http.on('request', createApp(store, photos, lobby));
  attachSockets(io, lobby, store);

  http.listen(config.port, config.host, () => log.info('Puzzle Clash listening', { port: config.port }));

  const shutdown = () => {
    io.close();
    http.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 4000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  log.error('fatal', { error: errMessage(err) });
  process.exit(1);
});
