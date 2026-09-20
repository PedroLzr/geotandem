# GeoTandem

GeoTandem es un juego de geografía en tiempo real para **una o dos personas**. Juega en solitario o compite identificando siluetas de países, banderas y capitales.

Se juega desde el navegador, sin cuentas ni base de datos. La interfaz y las preguntas están en inglés. Incluye datos de 80 países y funciona en ordenador y móvil.

## Inicio rápido con Docker

Necesitas **Docker y Docker Compose v2**. Ejecuta los comandos desde la carpeta del proyecto:

```sh
docker compose up --build -d
```

Abre **http://localhost:3039**. No necesitas instalar Node.js para esta opción.

Comandos útiles:

```sh
docker compose ps                # Ver el estado del servicio
docker compose logs -f geotandem # Ver los registros (Ctrl+C para salir)
docker compose down              # Detener y eliminar el contenedor
```

## Cómo jugar

1. Abre la web e introduce un nombre de invitado de entre 1 y 24 caracteres.
2. Pulsa **Create Game** para crear una sala.
3. La otra persona abre la misma web, introduce su nombre y pulsa **Join game** en tu sala.
4. Cuando ambos estéis conectados, quien creó la sala pulsa **Start expedition**.
5. Al terminar, ambos podéis pulsar **Play Again** para jugar una nueva partida.

Para jugar en solitario, pulsa **Play solo**, a la derecha de **Create Game**. La partida empieza directamente con la cuenta atrás de la primera fase, sin esperar a otro jugador. Completa las mismas 30 preguntas, consulta tus resultados y pulsa **Play Again** para empezar otra partida. Las partidas individuales no aparecen en la lista pública de salas.

Para probar el modo de dos jugadores desde un solo ordenador, usa una ventana normal y otra privada. Evita duplicar una pestaña abierta: puede copiar la sesión del mismo jugador.

Para jugar desde otro dispositivo de la misma red, abre `http://IP-DEL-SERVIDOR:3039`, sustituyendo `IP-DEL-SERVIDOR` por la IP local del ordenador que ejecuta el juego. El cortafuegos debe permitir conexiones a ese puerto.

### Reglas

- Hay tres fases: siluetas, banderas y capitales.
- Cada fase tiene 10 preguntas: **30 preguntas por jugador**.
- Cada pregunta ofrece seis opciones, una correcta y **10 segundos** para responder.
- Ambos jugadores reciben las mismas preguntas y opciones, en el mismo orden.
- Cada jugador avanza a su ritmo. La siguiente fase empieza cuando ambos terminan la anterior, tras una cuenta atrás de tres segundos. En solitario, basta con terminar tus diez preguntas.
- La respuesta queda fijada al seleccionarla. Si se agota el tiempo, cuenta como fallo y registra 10 segundos de respuesta.
- En el modo de dos jugadores, gana quien tenga más aciertos. En caso de empate, gana quien tenga menor tiempo medio de respuesta, calculado sobre todas las preguntas. Si la diferencia es inferior a 10 milisegundos, hay empate. En solitario se muestran tus estadísticas, sin clasificación frente a un rival.

### Si se pierde la conexión

Puedes recuperar tu sesión al recargar la misma pestaña. Hay **45 segundos para reconectarte**; durante ese tiempo, el reloj de las preguntas sigue corriendo.

Si un jugador no vuelve a tiempo o abandona una partida en curso, la partida termina. Las salas vacías se eliminan y las salas inactivas que no están en juego caducan a los 15 minutos.

## Desarrollo local sin Docker

Necesitas **Node.js 22.13 o superior** y **npm**.

```sh
npm ci
npm run dev
```

Abre **http://localhost:5173**. Este comando inicia la interfaz con Vite y el servidor del juego en el puerto `3039`, con recarga automática al modificar el código.

No ejecutes a la vez Docker y el servidor local en el mismo puerto. Para detener el modo de desarrollo, pulsa `Ctrl+C`.

Para ejecutar la versión de producción sin Docker, después de instalar las dependencias:

```sh
npm run build
npm start
```

En este caso, abre **http://localhost:3039**.

## Configuración

Con Docker, copia el archivo de ejemplo y edita los valores que necesites:

```sh
cp .env.example .env
```

Docker Compose lee `.env` automáticamente. Por ejemplo, para abrir el juego en `http://localhost:8080`, cambia `HOST_PORT=8080` y ejecuta de nuevo `docker compose up -d`.

| Variable          | Valor predeterminado    | Para qué sirve                                                      |
| ----------------- | ----------------------- | ------------------------------------------------------------------- |
| `HOST_PORT`       | `3039`                  | Puerto del ordenador al usar Docker.                                |
| `PORT`            | `3039`                  | Puerto del servidor Node.js. Dentro del contenedor siempre es 3039. |
| `ALLOWED_ORIGINS` | Vacío                   | Direcciones web autorizadas para conectarse, separadas por comas.   |
| `NODE_ENV`        | `production` en Docker  | Activa las opciones de producción de las cabeceras de seguridad.    |
| `E2E_URL`         | `http://127.0.0.1:3039` | Dirección del juego que usarán las pruebas de navegador.            |

Sin `ALLOWED_ORIGINS`, se comprueba que el origen de la conexión coincida con el servidor. Si publicas la web con un dominio, puedes indicar, por ejemplo, `ALLOWED_ORIGINS=https://juego.ejemplo.com`.

Al ejecutar Node.js directamente, `.env` **no se carga automáticamente**: define las variables en la terminal. En Bash, por ejemplo:

```sh
PORT=8080 npm start
```

El modo de desarrollo espera que el servidor use el puerto `3039`. Si lo cambias, ajusta también los destinos de `proxy` en `vite.config.ts`.

## Pruebas y comprobaciones

Después de ejecutar `npm ci`:

```sh
npm test             # Pruebas de las reglas y la conexión entre jugadores
npm run lint         # Revisar el código
npm run build        # Comprobar TypeScript y generar la versión de producción
npm run format:check # Comprobar el formato de los archivos
```

Para las pruebas de navegador, deja primero el juego en marcha en el puerto `3039` —con Docker o con `npm start` después de compilar— y ejecuta en otra terminal:

```sh
npx playwright install chromium
npm run test:e2e
```

Estas pruebas comprueban una partida completa con dos jugadores, la reconexión, la revancha, la visualización en móvil y las banderas. Para usar otra dirección, en Bash:

```sh
E2E_URL=http://localhost:8080 npm run test:e2e
```

Las capturas se guardan en `artifacts/` y los resultados y trazas de fallos en `test-results/`. El registro de las comprobaciones anteriores está en [VERIFICATION.md](VERIFICATION.md).

## Organización del proyecto

La interfaz usa **React, TypeScript y Vite**. El servidor usa **Node.js, Express y Socket.IO** para mantener a los dos jugadores sincronizados. El servidor controla las preguntas, los tiempos y la puntuación.

```text
backend/             Servidor, reglas del juego y generación de preguntas
frontend/src/        Interfaz y estilos
frontend/public/     Imágenes públicas e icono de la web
shared/              Tipos y constantes compartidos
data/                Países, capitales, siluetas y banderas
scripts/             Generación de recursos y revisión visual
tests/               Pruebas del juego y de las conexiones
tests/e2e/           Pruebas de navegador
artifacts/           Capturas de las comprobaciones visuales
licenses/            Licencias de recursos de terceros
Dockerfile           Construcción de la imagen de producción
compose.yml          Configuración del servicio Docker
```

## Datos y licencias

Los datos están en `data/countries.json` y las siluetas y banderas en `data/assets.json`. El juego incluye estos recursos: **no consulta servicios externos durante las partidas**.

Las siluetas proceden de Natural Earth mediante `world-atlas`; las banderas, de `flag-icons`; y los nombres, códigos y capitales, de `country-codes`. Algunos países se excluyen de ciertas fases para evitar siluetas difíciles de reconocer o capitales ambiguas. Las siluetas se simplifican para facilitar su lectura.

Para regenerar las siluetas y banderas después de modificar los datos:

```sh
npm run data:build
```

Para regenerar la ilustración del globo de la portada:

```sh
npx tsx scripts/build-globe.ts
```

No necesitas regenerar estos archivos para arrancar el juego normalmente. Consulta las fuentes, atribuciones y licencias en [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) y en `licenses/`.

## Funcionamiento y límites

- Las salas y sesiones se guardan en memoria. **Reiniciar el servidor borra las partidas y las sesiones**.
- Está diseñado para un único proceso de servidor, con un máximo de 200 salas y 2.000 sesiones. Usar varias réplicas requiere adaptar el almacenamiento y la coordinación de las partidas.
- Para publicarlo en Internet, usa HTTPS y un proxy que conserve la cabecera `Host` y permita conexiones WebSocket. Configura `ALLOWED_ORIGINS` si hace falta. El servidor no usa las cabeceras de IP reenviada; detrás de un proxy, los límites por IP pueden afectar a varios jugadores a la vez.
- Puedes comprobar que el servidor responde abriendo `/health`, por ejemplo `http://localhost:3039/health`. Debe devolver `{"status":"ok"}`.
- La interfaz se adapta a pantallas desde 320 píxeles y permite usar el teclado. Las preguntas de siluetas y banderas requieren reconocimiento visual.

## Problemas habituales

| Problema                           | Qué revisar                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| El puerto 3039 está ocupado        | Detén el otro servicio o cambia `HOST_PORT` en Docker.                                                         |
| Otro dispositivo no puede entrar   | Usa la IP local del servidor, comprueba que ambos estén en la misma red y permite el puerto en el cortafuegos. |
| Dos pestañas usan el mismo jugador | Abre una ventana privada e introduce otro nombre.                                                              |
| La web carga, pero no conecta      | Revisa los registros, `ALLOWED_ORIGINS` y el soporte WebSocket del proxy si lo utilizas.                       |
| La partida desaparece al reiniciar | Es el comportamiento previsto: las partidas no se guardan en disco.                                            |
