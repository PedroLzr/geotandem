import { createApp } from './server';
const port = Number(process.env.PORT ?? 3039);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535.');
const server = createApp();
server.http.listen(port, '0.0.0.0', () => console.log(`GeoTandem is listening on port ${port}.`));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
