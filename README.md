 # Casa · Panel para tablet

**Instalación en otro servidor:** [Guía de Instalación · Casa + Alexa](docs/guia-instalacion.md) — despliegue completo, login VNC, persistencia y comprobaciones.

   Panel doméstico en español con cuatro tarjetas: tiempo, noticias, Google Calendar
 y compras de Alexa. HTML/CSS/JavaScript sin framework; servidor Node.js 24 con dos
 dependencias para RSS e iCalendar. Sin base de datos ni compilación.

   ## Estado real de la entrega

   - Interfaz adaptable, reloj Europe/Andorra, Open-Meteo, RSS de El País, BBC Mundo y
 Euronews por defecto, iCal de Google Calendar y adaptador JSON externo para compras.
   - Consulta cada 15 minutos con la página visible y al volver de suspensión si venció
 el intervalo. Reloj actualizado cada segundo y botón de actualización manual; límite
 del servidor: una consulta cada 30 segundos por fuente.
   - Fallos independientes por fuente: se conservan los últimos datos durante la
 sesión/proceso con aviso superior de error o antigüedad que identifica la fuente
 (por ejemplo, `Fuente no disponible: Alexa (lista de compras)`). Sin caché persistente
 tras reiniciar servidor o cerrar página.
   - Modo claro, pantalla completa y solicitud de Screen Wake Lock. Datos ficticios solo
 al activar «Vista de ejemplo» en Ajustes; desactivada por defecto y sin guardar la elección.
   - Google Calendar necesita el enlace secreto iCal del usuario. Lectura, sin crear ni
 editar eventos. Incluye recurrencias, excepciones, eventos de día completo y cambios de
 zona horaria.
   - Amazon retiró List Management REST API el 1 de julio de 2024. Se usa
 `alexa-shopping-reader`: lectura de Amazon España mediante Playwright y perfil
 persistente autenticado manualmente, sin modificar la lista.
   - Casa recibe la lista por `GET ALEXA_BRIDGE_URL`, muestra los artículos
 pendientes/completados y avisa si los datos superan 30 minutos. Si Amazon devuelve
 `login_required`, muestra un botón autenticado para solicitar el acceso VNC; un watcher
 interno inicia `start-login.sh` una sola vez mediante un archivo de solicitud y
 bloqueo. La distribución por pantalla se detalla en «Tablet».
   - Repositorio: https://github.com/guillesrl/casa-panel. El servicio está desplegado
 en EasyPanel/Docker Swarm y su código se publica desde la rama `main`.

   ## Estructura del monorepo

   Dos servicios independientes:

   - `casa-panel` en la raíz: panel Node.js en EasyPanel con el `Dockerfile` raíz.
   - `alexa-shopping-reader/`: lector Playwright, adaptador HTTP y login VNC; servicio
 privado con `alexa-shopping-reader/Dockerfile`.

   Ambos servicios comparten el contrato JSON, pero se despliegan por separado. El
 perfil de Chromium, cookies, `.venv`, estados, tokens y archivos `.env` están excluidos
 de Git.

   ## Ejecutar

   ```bash
   npm ci
   cp .env.example .env
   npm start
   ```

   Abrir http://localhost:3000. En desarrollo, si no hay contraseña, funciona sin
 autenticación. Antes de exponerlo a internet, configurar las credenciales y HTTPS. El
 servidor rechaza el arranque en `NODE_ENV=production` si faltan usuario o contraseña.

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
   | `NEWS_RSS_URL` | Feed principal (El País por defecto); se combina con BBC Mundo y
 Euronews |
   | `NEWS_RSS_URLS` | Opcional: lista de RSS/Atom HTTPS separados por comas o saltos de
 línea; reemplaza las fuentes predeterminadas |
   | `GOOGLE_CALENDAR_ICS_URL` | Dirección secreta iCal; dejar vacía hasta conectar |
   | `DASHBOARD_USER` | Obligatorio en producción |
   | `DASHBOARD_PASSWORD` | Contraseña única y larga; obligatorio en producción |
   | `ALEXA_BRIDGE_URL` | Endpoint HTTPS del adaptador externo o
 `http://alexa-shopping-reader:8765/` dentro de la red privada de Docker |
   | `ALEXA_BRIDGE_TOKEN` | Bearer token del adaptador |
   | `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP` | `true` solo para el hostname exacto
 `alexa-shopping-reader` en la red privada; por defecto `false` |

   URLs y credenciales permanecen en el servidor; el navegador solo recibe datos
 normalizados. `.env` está excluido de Git y Docker. Sin editor público de configuración.

   ### Google Calendar

   En Google Calendar, abre Configuración, selecciona el calendario, entra en «Integrar
 calendario» y copia «Dirección secreta en formato iCal». Añádela como
 `GOOGLE_CALENDAR_ICS_URL` en las variables de EasyPanel. No conviertas el calendario en
 público. Si tu cuenta administrada no ofrece ese enlace, habrá que implementar OAuth u
 otra conexión autorizada.

   Ventana de siete días y hasta 30 eventos. El feed iCal de Google puede añadir retraso
 al intervalo del panel. Los eventos de día completo conservan su fecha; las horas y el
 reloj se muestran en `TZ`.

   ### Integración de Alexa

   Fuente oficial sobre la retirada de la API:

 https://developer.amazon.com/en-US/docs/alexa/ask-overviews/deprecated-features.html#shopping-lists

   El servicio `alexa-shopping-reader` responde a `GET ALEXA_BRIDGE_URL`, con
 autorización `Bearer`, usando este contrato:

   ```json
   {
     "updatedAt": "2026-10-30T09:30:00.000Z",
     "items": [
       {"id": "1", "name": "Leche", "completed": false},
       {"id": "2", "name": "Pan", "completed": true}
     ]
   }
   ```

   `updatedAt`: fecha de lectura de Amazon; aviso tras 30 minutos sin datos nuevos.
 `completed`: booleano. Máximo 300 artículos; consulta sin enviar cambios a Alexa.

   El lector usa:

   - Amazon España: `https://www.amazon.es/gp/alexa-shopping-list`.
   - Perfil persistente fuera del repositorio:
 `/home/ubuntu/.local/share/alexa-shopping-reader/profile`.
   - Servicio interno Docker: `http://alexa-shopping-reader:8765/`.
   - Token Bearer almacenado como secreto del servicio, nunca en GitHub ni en el
 navegador.

   El acceso HTTP interno solo se permite para el hostname exacto
 `alexa-shopping-reader` cuando `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP=true`. El puerto 8765
 no se publica a Internet. La sesión inicial de Amazon se realiza manualmente mediante
 VNC sobre túnel SSH; las credenciales no se envían por Telegram ni se guardan como
 contraseña.

   ### Procesos de Chromium: init obligatorio en el lector

   El servicio Docker Swarm `alexa-shopping-reader` debe ejecutarse con **`init=true`**.
 El init recoge los procesos huérfanos de Chromium para evitar que se acumulen procesos
 zombis, incluso cuando Playwright llama a `browser.close()`. No hace falta instalar
 systemd dentro del contenedor ni reiniciar todo el VPS.

   **Reiniciar el VPS de OVH o el contenedor conserva esta opción en el servicio
 existente.** Sin embargo, eliminar y recrear el servicio, o redesplegarlo con una
 configuración que reemplace esta opción, puede desactivarla. Mantenerla en la
 definición de despliegue del lector y comprobarla después de recrearlo. El panel web y
 el lector se despliegan por separado.

   Para comprobar la configuración guardada en Swarm:

   ```bash
   sudo docker service inspect alexa-shopping-reader \
     --format 'Init={{.Spec.TaskTemplate.ContainerSpec.Init}}'
   ```

   El resultado esperado es `Init=true`. Para verificar el contenedor en ejecución,
 obtener primero su ID y usarlo en el segundo comando (si hay varias tareas durante un
 despliegue, comprobar cada una):

   ```bash
   sudo docker ps --filter label=com.docker.swarm.service.name=alexa-shopping-reader \
     --format 'table {{.ID}}\t{{.Status}}'
   sudo docker exec ID_DEL_CONTENEDOR sh -c 'readlink /proc/1/exe'
   ```

   La ruta del ejecutable del PID 1 debe terminar en `docker-init`.

   Si aparece `Init=false`, se puede activar con el siguiente comando. **Recrea el
 contenedor e interrumpe brevemente las lecturas de Alexa**; ejecutarlo en un momento
 adecuado:

   ```bash
   sudo docker service update --init=true --detach=false alexa-shopping-reader
   ```

   Este cambio no modifica la imagen ni el montaje persistente `/data` que contiene la
 sesión de Amazon. No eliminar ese volumen o directorio para resolver los zombis. Si se
 utiliza Docker Compose para definir el lector, declarar `init: true` en su servicio; en
 otros gestores, conservar la opción equivalente y verificar el valor efectivo en Swarm
 después del despliegue.

   ## GitHub y EasyPanel

   1. Usar el repositorio `guillesrl/casa-panel`. No subir `node_modules` ni `.env`.
   2. En EasyPanel crear un servicio de aplicación y conectar el repositorio y su rama
 principal.
   3. Seleccionar construcción con **Dockerfile**, ruta `Dockerfile`, contexto raíz del
 repositorio.
   4. Configurar `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `ALEXA_BRIDGE_URL`,
 `ALEXA_BRIDGE_TOKEN` y `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP` en las variables del
 servicio. El Dockerfile ya define `NODE_ENV=production`, `TZ=Europe/Andorra` y
 `PORT=3000`.
   5. Configurar dominio con HTTPS y puerto interno **3000**. Desplegar. No requiere
 volúmenes persistentes.
   6. Verificar `/healthz` (sin datos privados), abrir el panel y autenticarse.
 Comprobar tiempo/noticias con acceso real a internet, añadir un evento de prueba al
 calendario y comprobar su aparición al actualizar. Activar despliegue automático desde
 GitHub si se desea.

   Comandos de Git para un repositorio vacío (reemplazar la URL por la del repositorio
 creado):

   ```bash
   git init -b main
   git add .
   git commit -m "feat: add tablet home dashboard"
   git remote add origin https://github.com/USUARIO/casa-panel.git
   git push -u origin main
   ```

   No utiliza GitHub Pages: el servidor es necesario para ocultar credenciales y
 consultar RSS/calendario sin problemas de CORS.

   ### Despliegue automático

   Los pushes a `main` activan el servicio `paginas_web/casa-panel` mediante un webhook
 de GitHub. El callback debe usar el dominio HTTPS público de EasyPanel
 (`panel.guillers.es`), formato `application/json` y verificación TLS activada. No debe
 apuntar a la IP por el puerto 3000 cuando el acceso directo por IP está deshabilitado.

   `forceRebuild=true` fuerza la descarga y construcción en cada push, aunque la caché
 de GitHub devuelva un commit anterior. Evita que EasyPanel omita la construcción,
 pero puede aumentar su duración.

   La URL del webhook contiene un token: guardarla solo en GitHub/EasyPanel, nunca en
 el repositorio ni en logs. Ante fallos, comprobar el estado HTTP de las entregas y el
 despliegue en EasyPanel; activar auto-deploy no demuestra que el webhook funcione.
 El lector Alexa se despliega por separado.

   ## Tablet

   Diseñado para tablet en horizontal, incluida la resolución 2000×1200: clima, agenda,
 Alexa y noticias en cuatro cuadrantes iguales. En pantallas estrechas pasa a una
 columna. Ajustes → Pantalla encendida solicita Wake Lock, disponible según navegador y
 HTTPS; si el sistema lo impide, ajustar el bloqueo de pantalla de la tablet. Pantalla
 completa necesita una pulsación del usuario y puede no estar disponible en Safari/iPad;
 se puede usar «Añadir a pantalla de inicio». No es una aplicación offline.

   ## Verificación realizada

   - Comprobación de sintaxis de servidor y cliente.
   - Siete pruebas automatizadas: intervalo/caché/fallo, fuentes sin configurar,
 recurrencias/EXDATE/overrides/cancelación/cambio horario, eventos completos/en curso,
 RSS/enlaces, validación del adaptador y protección de producción/API.
   - Revisión en navegador de la interfaz y vista de ejemplo.
   - Desde desarrollo: Open-Meteo devolvió HTTP 200 con las variables solicitadas y RSS,
 HTTP 200 con ocho titulares normalizados. El contenedor de vista previa no accedió a
 esas fuentes; la captura usa datos de ejemplo. Verificación integral en EasyPanel pendiente.
   - Integración Alexa verificada desde Casa: HTTP 200, estado `ok` y cuatro artículos
 reales de Amazon España.
   - El adaptador Docker se construyó y se verificó sin puerto publicado; las
 solicitudes sin token devuelven HTTP 401.

   ## Fuentes

   - Meteorología: https://open-meteo.com/ (atribución visible; revisar condiciones si
 cambia el uso personal).
   - Noticias: https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada (solo
 títulos, fuente y enlace al medio).
   - iCalendar: https://github.com/jens-maus/node-ical

   El botón «Reconectar Alexa» abre Amazon con el perfil del servidor y, cuando termina,
 actualiza la tarjeta. Si Amazon requiere una identificación, indica que hay que acceder
 por VNC. El watcher del host requiere `reconnect.py` y la versión actual de
 `login-request-watcher.sh`; el lector Docker debe incluir la versión actual de
 `bridge_server.py`.

   El botón de reproducción junto a actualizar activa el carrusel: clima con agenda
 a partes iguales durante 12 segundos, y Alexa (30%) con noticias (70%) durante 20.
 Los titulares del carrusel usan letra ampliada (24–34 px según el ancho de pantalla)
 para facilitar la lectura a distancia; la tipografía de la vista normal no cambia.
 En pantallas estrechas las parejas se apilan: Alexa ocupa el 30% de la altura útil y
 noticias el 70%, mientras clima y agenda mantienen alturas iguales. Al detenerlo
 vuelve la distribución normal, sin cambios: cuatro cuadrantes iguales en tablet y
 escritorio, o una columna en pantallas estrechas.
