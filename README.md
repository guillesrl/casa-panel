# Casa · Panel para tablet

Panel doméstico ligero en español, inspirado en pantallas de hogar. Tres tarjetas visibles: tiempo, actualidad general de varias fuentes y Google Calendar. La lista de compra queda oculta hasta conectar Alexa. HTML/CSS/JavaScript sin framework en el navegador; servidor Node.js 24 con dos dependencias para RSS e iCalendar. No necesita base de datos ni compilación.

## Estado real de la entrega

- Implementados: interfaz adaptable, reloj Europe/Andorra, consulta meteorológica Open-Meteo, lector RSS de El País, BBC Mundo y Euronews por defecto, lector iCal de Google Calendar y lector de un adaptador JSON externo para la lista.
- Datos consultados cada 15 minutos mientras la página está visible. Al volver de suspensión se actualiza si venció el intervalo. El reloj se actualiza cada segundo. Botón de actualización manual; el servidor limita nuevas consultas a una cada 30 segundos por fuente.
- Cada fuente falla de forma independiente. Se conservan los últimos datos durante la sesión/proceso con aviso de antigüedad; no hay caché persistente tras reiniciar servidor o cerrar página.
- Modo claro, pantalla completa, solicitud de Screen Wake Lock y vista de ejemplo explícita. Datos ficticios únicamente al activar «Vista de ejemplo» en Ajustes; no se activa por defecto ni se guarda esa elección.
- Google Calendar necesita el enlace secreto iCal del usuario. Lectura, sin crear ni editar eventos. Incluye recurrencias, excepciones, eventos de día completo y cambios de zona horaria.
- **Alexa NO está conectada.** Amazon retiró List Management REST API el 1 de julio de 2024. Este repositorio define una entrada para un adaptador externo, pero no incluye un sistema para extraer la lista de la cuenta Amazon. No basta con pegar una contraseña Amazon. La integración concreta se debe elegir y probar por separado.
- Repositorio: https://github.com/guillesrl/casa-panel. Despliegue en EasyPanel pendiente; se incluye Dockerfile.

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

### Adaptador Alexa pendiente

Fuente oficial sobre la retirada de la API:
https://developer.amazon.com/en-US/docs/alexa/ask-overviews/deprecated-features.html#shopping-lists

Un adaptador compatible debe responder a `GET ALEXA_BRIDGE_URL`, con autorización `Bearer` si se configura token, usando este contrato:

```json
{
  "updatedAt": "2026-10-30T09:30:00.000Z",
  "items": [
    {"id": "1", "name": "Leche", "completed": false},
    {"id": "2", "name": "Pan", "completed": true}
  ]
}
```

`updatedAt` debe indicar cuándo se obtuvo la lista de su origen, no cuándo se abrió este endpoint. Tras 30 minutos sin datos nuevos se muestra un aviso. `completed` debe ser booleano. Máximo 300 artículos. La tablet muestra la lista en modo consulta; no envía cambios a Alexa. n8n podría servir este contrato **solo si cuenta con una fuente compatible ya conectada**; n8n por sí solo no restablece la API retirada.

## GitHub y EasyPanel

1. Usar el repositorio `guillesrl/casa-panel`. No subir `node_modules` ni `.env`.
2. En EasyPanel crear un servicio de aplicación y conectar el repositorio y su rama principal.
3. Seleccionar construcción con **Dockerfile**, ruta `Dockerfile`, contexto raíz del repositorio.
4. Configurar `DASHBOARD_USER`, `DASHBOARD_PASSWORD` y el enlace iCal en las variables del servicio. El Dockerfile ya define `NODE_ENV=production`, `TZ=Europe/Andorra` y `PORT=3000`.
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

## Tablet

Diseñado para vista horizontal de 1024×768 o superior, con dos columnas. En pantallas estrechas pasa a una columna. Ajustes → Pantalla encendida solicita Wake Lock, disponible según navegador y HTTPS; si el sistema lo impide, ajustar el bloqueo de pantalla de la tablet. Pantalla completa necesita una pulsación del usuario y puede no estar disponible en Safari/iPad; se puede usar «Añadir a pantalla de inicio». No es una aplicación offline.

## Verificación realizada

- Comprobación de sintaxis de servidor y cliente.
- Siete pruebas automatizadas: intervalo/caché/fallo, fuentes sin configurar, recurrencias/EXDATE/overrides/cancelación/cambio horario, eventos completos/en curso, RSS/enlaces, validación del adaptador y protección de producción/API.
- Revisión en navegador de la interfaz y vista de ejemplo.
- Peticiones reales desde el entorno de desarrollo: Open-Meteo respondió HTTP 200 con las variables solicitadas y el RSS respondió HTTP 200 con ocho titulares normalizados. El contenedor separado de vista previa no logró acceder a esas fuentes; la captura usa el modo de ejemplo. La comprobación integral desde EasyPanel queda pendiente.
- Sin credenciales de Google Calendar ni adaptador Alexa: no se verificaron cuentas reales.
- Dockerfile preparado; no se construyó la imagen Docker en este entorno.

## Fuentes

- Meteorología: https://open-meteo.com/ (atribución visible; revisar condiciones si cambia el uso personal).
- Noticias: https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada (solo títulos, fuente y enlace al medio).
- iCalendar: https://github.com/jens-maus/node-ical
