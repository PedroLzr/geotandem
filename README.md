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
2. Pulsa **Create duel** para crear una sala.
3. La otra persona abre la misma web, introduce su nombre y pulsa **Join game** en tu sala.
4. Cuando ambos estéis conectados, quien creó la sala pulsa **Start expedition**.
5. Al terminar, ambos podéis pulsar **Play Again** para jugar una nueva partida.

Para jugar en solitario, pulsa **Play solo**, junto a **Create duel**. La partida empieza directamente con la cuenta atrás de la primera fase, sin esperar a otro jugador. Completa las mismas 30 preguntas, consulta tus resultados y pulsa **Play Again** para empezar otra partida. Las partidas individuales no aparecen en la lista pública de salas.

Para jugar en grupo, pulsa **Create arena · 2–8**. Comparte la invitación desde la sala; el anfitrión puede iniciar con entre dos y ocho participantes conectados. Una vez iniciada, no se admiten nuevos jugadores. La clasificación se muestra junto a la pregunta en escritorio y se despliega al tocar **Leaderboard** en móvil. Al terminar, el anfitrión puede pulsar **Play again** para volver a la sala, invitar y lanzar otra partida. El modo Duelo conserva sus reglas y pantallas.

Para probar el modo de dos jugadores desde un solo ordenador, usa una ventana normal y otra privada. Evita duplicar una pestaña abierta: puede copiar la sesión del mismo jugador.

Para jugar desde otro dispositivo de la misma red, abre `http://IP-DEL-SERVIDOR:3039`, sustituyendo `IP-DEL-SERVIDOR` por la IP local del ordenador que ejecuta el juego. El cortafuegos debe permitir conexiones a ese puerto.

### Reglas

- Solo y Arena tienen tres fases: siluetas, banderas y capitales. Duelo añade una cuarta fase obligatoria: **Ubicación**.
- Cada fase tiene 10 preguntas: **40 en Duelo, 30 en Solo y Arena**.
- En las tres primeras fases, cada pregunta ofrece seis opciones, una correcta y **10 segundos** para responder.
- Todos los jugadores reciben las mismas preguntas y opciones, en el mismo orden.
- En las tres primeras fases, cada jugador avanza a su ritmo. La siguiente fase empieza cuando todos terminan la anterior, tras una cuenta atrás de tres segundos. En solitario, basta con terminar tus diez preguntas. Ubicación avanza de forma sincronizada.
- En las preguntas de opciones, la respuesta queda fijada al seleccionarla. Si se agota el tiempo, cuenta como fallo y registra 10 segundos de respuesta.
- En Duelo y Arena, gana quien tenga más aciertos. En caso de empate, gana quien tenga menor tiempo medio de respuesta, calculado sobre todas las preguntas. Si la diferencia es inferior a 10 milisegundos, hay empate. En solitario se muestran tus estadísticas, sin clasificación frente a un rival.

### Ubicación (solo Duelo)

- Cada ronda ofrece un mapa libre sin etiquetas y **15 segundos**. Se puede ampliar, desplazar y colocar o mover un marcador; **Confirm location** lo bloquea.
- El servidor conserva el último marcador recibido y lo confirma automáticamente al agotar el tiempo. Sin marcador, la respuesta es incorrecta. Una confirmación manual no revela nada al rival antes de resolver la ronda.
- Un marcador **dentro del país es acierto**; fuera del país o sin marcador, es fallo. Cada jugador se evalúa de forma independiente: ambos pueden acertar o fallar. Se usa la misma selección territorial que en las siluetas y la misma geometría para pintar y puntuar.
- Al confirmar ambos o agotar el tiempo, se muestran los dos marcadores, el acierto o fallo de cada jugador y el país completo en dorado durante cuatro segundos. La vista encuadra las selecciones y el país; un control permite ampliar el país resaltado.
- Esos aciertos, fallos y tiempos se incorporan a las estadísticas habituales y al resultado de las 40 preguntas. Solo y Arena mantienen las tres fases anteriores.
- Los mapas se empaquetan con la aplicación y se precargan al entrar en un duelo; no dependen de servicios externos. `npm run data:build` regenera las siluetas, banderas y geometrías.

### Si se pierde la conexión

Puedes recuperar tu sesión al recargar la misma pestaña. Hay **45 segundos para reconectarte**; durante ese tiempo, el reloj de las preguntas sigue corriendo.

En Duelo, si un jugador no vuelve a tiempo o abandona una partida en curso, la partida termina. En Arena, se retira a ese jugador y el resto continúa mientras queden al menos dos; si sale el anfitrión, otro participante asume ese papel. Los resultados finales de Arena se conservan aunque alguien salga de la sala. Las salas vacías se eliminan y las salas inactivas que no están en juego caducan a los 15 minutos.

## Organización del proyecto

La interfaz usa **React, TypeScript y Vite**. El servidor usa **Node.js, Express y Socket.IO** para mantener a los jugadores sincronizados. El servidor controla las preguntas, los tiempos y la puntuación.

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

## Funcionamiento y límites

- Las salas y sesiones se guardan en memoria. **Reiniciar el servidor borra las partidas y las sesiones**.
- Está diseñado para un único proceso de servidor, con un máximo de 200 salas y 2.000 sesiones. Usar varias réplicas requiere adaptar el almacenamiento y la coordinación de las partidas.
- Para publicarlo en Internet, usa HTTPS y un proxy que conserve la cabecera `Host` y permita conexiones WebSocket. Configura `ALLOWED_ORIGINS` si hace falta. El servidor no usa las cabeceras de IP reenviada; detrás de un proxy, los límites por IP pueden afectar a varios jugadores a la vez.
- Puedes comprobar que el servidor responde abriendo `/health`, por ejemplo `http://localhost:3039/health`. Debe devolver `{"status":"ok"}`.
- La interfaz se adapta a pantallas desde 320 píxeles y permite usar el teclado. Las preguntas de siluetas y banderas requieren reconocimiento visual.
