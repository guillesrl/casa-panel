# Casa · Panel para tablet

Panel doméstico ligero en español, inspirado en pantallas de hogar. Cuatro tarjetas visibles: tiempo, actualidad general, Google Calendar y lista de compras de Alexa. HTML/CSS/JavaScript sin framework en el navegador; servidor Node.js 24 con dos dependencias para RSS e iCalendar. No necesita base de datos ni compilación.

## Estado real de la entrega

- Implementados: interfaz adaptable, reloj Europe/Andorra, consulta meteorológica Open-Meteo, lector RSS de El País, BBC Mundo y Euronews por defecto, lector iCal de Google Calendar y lector de un adaptador JSON externo para la lista.
- Datos consultados cada 15 minutos mientras la página está visible. Al volver de suspensión se actualiza si venció el intervalo. El reloj se actualiza cada segundo. Botón de actualización manual; el servidor limita nuevas consultas a una cada 30 segundos por fuente.
- Cada fuente falla de forma independiente. Se conservan los últimos datos durante la sesión/proceso con aviso de antigüedad; no hay caché persistente tras reiniciar servidor o cerrar página.
- Modo claro, pantalla completa, solicitud de Screen Wake Lock y vista de ejemplo explícita. Datos ficticios únicamente al activar «Vista de ejemplo» en Ajustes; no se activa por defecto ni se guarda esa elección.
- Google Calendar necesita el enlace secreto iCal del usuario. Lectura, sin crear ni editar eventos. Incluye recurrencias, excepciones, eventos de día completo y cambios de zona horaria.
- Amazon retiró List Management REST API el 1 de julio de 2024. La integración actual usa el servicio externo `alexa-shopping-reader`, que lee Amazon España mediante Playwright y un perfil persistente autenticado manualmente. El lector es estrictamente de solo lectura.
- Casa recibe la lista por `GET ALEXA_BRIDGE_URL`, muestra los artículos pendientes/completados y avisa si los datos superan 30 minutos. Si Amazon devuelve `login_required`, muestra un botón autenticado para solicitar el acceso VNC; un watcher interno inicia `start-login.sh` una sola vez mediante un archivo de solicitud y bloqueo. En tablet, clima, agenda y Alexa ocupan la fila superior; noticias ocupa todo el ancho de la fila inferior. En móvil, las tarjetas se apilan.
- Repositorio: https://github.com/guillesrl/casa-panel. El servicio está desplegado en EasyPanel/Docker Swarm y su código se publica desde la rama `main`.

## Estructura del monorepo

El repositorio contiene los dos servicios de la integración:

- `casa-panel` en la raíz: panel web Node.js desplegado en EasyPanel usando el `Dockerfile` raíz.
- `alexa-shopping-reader/`: lector Playwright, adaptador HTTP y herramientas de login VNC.
- El lector se despliega como servicio privado independiente usando `alexa-shopping-reader/Dockerfile`.

Ambos servicios comparten el contrato JSON, pero se despliegan por separado. El perfil de Chromium, cookies, `.venv`, estados, tokens y archivos `.env` están excluidos de Git.

## Ejecutar

```bash
npm ci
cp .env.example .env
npm start
```

Abrir http://localhost:3000. En desarrollo, si no hay contraseña, funciona sin autenticación. Antes de exponerlo a internet, configurar las credenciales y HTTPS. El servidor rechaza el arranque en `NODE_ENV=production` si faltan usuario o contraseña.

```bash
npm run check
npm test
```

## Configuración

| Variable | Valor por defecto / uso |
| --- | --- |
| `PORT` | `3000` |
| `TZ` | `Europe/Andorra` |
| `WEATHER_CITY` | `Andorra la Vella` |
| `WEATHER_LAT`, `WEATHER_LON` | `42.5063`, `1.5218` |
| `NEWS_RSS_URL` | Feed principal (El País por defecto); se combina con BBC Mundo y Euronews |
| `NEWS_RSS_URLS` | Opcional: lista de RSS/Atom HTTPS separados por comas o saltos de línea; reemplaza las fuentes predeterminadas |
| `GOOGLE_CALENDAR_ICS_URL` | Dirección secreta iCal; dejar vacía hasta conectar |
| `DASHBOARD_USER` | Obligatorio en producción |
| `DASHBOARD_PASSWORD` | Contraseña única y larga; obligatorio en producción |
| `ALEXA_BRIDGE_URL` | Endpoint HTTPS del adaptador externo o `http://alexa-shopping-reader:8765/` dentro de la red privada de Docker |
| `ALEXA_BRIDGE_TOKEN` | Bearer token del adaptador |
| `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP` | `true` solo para el hostname exacto `alexa-shopping-reader` en la red privada; por defecto `false` |

Las URLs y credenciales se usan solo en el servidor. El navegador recibe los datos normalizados, no los secretos. `.env` está excluido de Git y Docker. La aplicación solo admite lectura; no expone un editor público de configuración.

### Google Calendar

En Google Calendar, abre Configuración, selecciona el calendario, entra en «Integrar calendario» y copia «Dirección secreta en formato iCal». Añádela como `GOOGLE_CALENDAR_ICS_URL` en las variables de EasyPanel. No conviertas el calendario en público. Si tu cuenta administrada no ofrece ese enlace, habrá que implementar OAuth u otra conexión autorizada.

La ventana es de siete días y hasta 30 eventos. La velocidad con la que Google actualice su feed iCal puede añadir retraso respecto al intervalo del panel. Las fechas de día completo conservan su fecha de calendario; hora de eventos y reloj se muestran en `TZ`.

### Integración de Alexa

Fuente oficial sobre la retirada de la API:
https://developer.amazon.com/en-US/docs/alexa/ask-overviews/deprecated-features.html#shopping-lists

El servicio `alexa-shopping-reader` responde a `GET ALEXA_BRIDGE_URL`, con autorización `Bearer`, usando este contrato:

```json
{
  "updatedAt": "2026-10-30T09:30:00.000Z",
  "items": [
    {"id": "1", "name": "Leche", "completed": false},
    {"id": "2", "name": "Pan", "completed": true}
  ]
}
```

`updatedAt` indica cuándo se obtuvo la lista de Amazon. Tras 30 minutos sin datos nuevos se muestra un aviso. `completed` debe ser booleano. Máximo 300 artículos. La tablet muestra la lista en modo consulta; no envía cambios a Alexa.

El lector usa:

- Amazon España: `https://www.amazon.es/gp/alexa-shopping-list`.
- Perfil persistente fuera del repositorio: `/home/ubuntu/.local/share/alexa-shopping-reader/profile`.
- Servicio interno Docker: `http://alexa-shopping-reader:8765/`.
- Token Bearer almacenado como secreto del servicio, nunca en GitHub ni en el navegador.

El acceso HTTP interno solo se permite para el hostname exacto `alexa-shopping-reader` cuando `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP=true`. El puerto 8765 no se publica a Internet. La sesión inicial de Amazon se realiza manualmente mediante VNC sobre túnel SSH; las credenciales no se envían por Telegram ni se guardan como contraseña.

## GitHub y EasyPanel

1. Usar el repositorio `guillesrl/casa-panel`. No subir `node_modules` ni `.env`.
2. En EasyPanel crear un servicio de aplicación y conectar el repositorio y su rama principal.
3. Seleccionar construcción con **Dockerfile**, ruta `Dockerfile`, contexto raíz del repositorio.
4. Configurar `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `ALEXA_BRIDGE_URL`, `ALEXA_BRIDGE_TOKEN` y `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP` en las variables del servicio. El Dockerfile ya define `NODE_ENV=production`, `TZ=Europe/Andorra` y `PORT=3000`.
5. Configurar dominio con HTTPS y puerto interno **3000**. Desplegar. No requiere volúmenes persistentes.
6. Verificar `/healthz` (sin datos privados), abrir el panel y autenticarse. Comprobar tiempo/noticias con acceso real a internet, añadir un evento de prueba al calendario y comprobar su aparición al actualizar. Activar despliegue automático desde GitHub si se desea.

Comandos de Git para un repositorio vacío (reemplazar la URL por la del repositorio creado):

```bash
git init -b main
git add .
git commit -m "feat: add tablet home dashboard"
git remote add origin https://github.com/USUARIO/casa-panel.git
git push -u origin main
```

No utiliza GitHub Pages: el servidor es necesario para ocultar credenciales y consultar RSS/calendario sin problemas de CORS.

### Despliegue automático

Los pushes a `main` activan el servicio `paginas_web/casa-panel` mediante un webhook de GitHub. El callback debe usar el dominio HTTPS público de EasyPanel (`panel.guillers.es`), formato `application/json` y verificación TLS activada. No debe apuntar a la IP por el puerto 3000 cuando el acceso directo por IP está deshabilitado.

El callback incluye `forceRebuild=true` para descargar y construir la fuente en cada push, incluso si la consulta de commits de GitHub aún devuelve una referencia anterior por caché. Esta opción evita que EasyPanel omita la construcción y puede aumentar el tiempo de build.

La URL completa del webhook contiene un token: mantenerla únicamente en la configuración de GitHub/EasyPanel, nunca en el repositorio ni en logs. Para diagnosticar fallos, comprobar el estado HTTP de las entregas de GitHub y la acción de despliegue correspondiente en EasyPanel; la opción de auto-deploy activada por sí sola no demuestra que el webhook funcione. El lector Alexa se despliega por separado.

## Tablet

Diseñado para tablet en horizontal, incluida la resolución 2000×1200: clima, agenda y Alexa en tres columnas superiores, noticias a todo el ancho debajo. En pantallas estrechas pasa a una columna. Ajustes → Pantalla encendida solicita Wake Lock, disponible según navegador y HTTPS; si el sistema lo impide, ajustar el bloqueo de pantalla de la tablet. Pantalla completa necesita una pulsación del usuario y puede no estar disponible en Safari/iPad; se puede usar «Añadir a pantalla de inicio». No es una aplicación offline.

## Verificación realizada

- Comprobación de sintaxis de servidor y cliente.
- Siete pruebas automatizadas: intervalo/caché/fallo, fuentes sin configurar, recurrencias/EXDATE/overrides/cancelación/cambio horario, eventos completos/en curso, RSS/enlaces, validación del adaptador y protección de producción/API.
- Revisión en navegador de la interfaz y vista de ejemplo.
- Peticiones reales desde el entorno de desarrollo: Open-Meteo respondió HTTP 200 con las variables solicitadas y el RSS respondió HTTP 200 con ocho titulares normalizados. El contenedor separado de vista previa no logró acceder a esas fuentes; la captura usa el modo de ejemplo. La comprobación integral desde EasyPanel queda pendiente.
- Integración Alexa verificada desde Casa: HTTP 200, estado `ok` y cuatro artículos reales de Amazon España.
- El adaptador Docker se construyó y se verificó sin puerto publicado; las solicitudes sin token devuelven HTTP 401.

## Fuentes

- Meteorología: https://open-meteo.com/ (atribución visible; revisar condiciones si cambia el uso personal).
- Noticias: https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada (solo títulos, fuente y enlace al medio).
- iCalendar: https://github.com/jens-maus/node-ical
