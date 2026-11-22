# Guía de Instalación · Casa + Alexa

Esta ruta instala ambos servicios en **un único servidor Ubuntu con Docker Swarm**, con el panel detrás de un proxy HTTPS y el lector privado. El login de Amazon se realiza en el host por VNC sobre SSH. **Guía validada estáticamente contra el código; no probada de extremo a extremo en un servidor nuevo.**

## Antes de empezar

- Servidor Ubuntu con usuario **`ubuntu`**, home `/home/ubuntu`, acceso SSH y `sudo`. Estas rutas y `User=ubuntu` están fijados en los scripts: otro usuario no es una sustitución automática.
- Docker Engine con Swarm activo, nodo manager único y systemd. No ejecutar `swarm init` sobre un Swarm existente. Instalar previamente Git, Python 3 con `venv`/pip, Xvfb, x11vnc, `ss` (iproute2), `flock` (util-linux), curl y un cliente VNC en tu ordenador. La instalación de Docker/paquetes depende del sistema y queda fuera de esta guía; no se proporcionan instaladores remotos.
- Un proxy inverso ya operativo, capaz de conectarse a una red overlay externa de Swarm: dominio propio (ejemplo `casa.example.net`), DNS hacia el servidor, certificado TLS válido y redirección HTTP → HTTPS. Publicar solo 80/443 para ese proxy y SSH restringido; **no publicar 3000, 8765, 5901 ni X11**. En un Swarm multinodo también harían falta reglas privadas entre nodos: no es la topología de esta guía.
- Salida HTTPS/DNS desde host y contenedores para construir imágenes, descargar Chromium y consultar Amazon, meteorología, noticias y, opcionalmente, Calendar.
- Esta ruta crea servicios manuales llamados `casa-panel` y `alexa-shopping-reader`. No ejecutar encima de servicios existentes ni crear un segundo lector sobre el mismo perfil. Si ya usas EasyPanel, consulta [la sección de operación](#servidor-existente-easypanel-y-actualizaciones) antes de continuar.

**Orden:** preparar código y host → completar login y cerrarlo → crear secreto/red → crear lector → panel → conectar proxy y verificar. No hacen falta cron ni Hermes.

## 1. Obtener y construir el código

Ejecutar como `ubuntu`. Sustituye `REVISION` por una etiqueta o SHA que quieras conservar y anótala para poder reproducir la instalación. Los directorios deben ser nuevos; si existen, detenerse y revisar, no sobrescribirlos.

```bash
set -euo pipefail
test "$(id -un)" = ubuntu
cd /home/ubuntu
test ! -e casa-panel
test ! -e alexa-shopping-reader
git clone https://github.com/guillesrl/casa-panel.git casa-panel
cd casa-panel
read -r -p 'Etiqueta o SHA a desplegar: ' REVISION
git switch --detach "$REVISION"
git rev-parse HEAD
sudo docker info --format '{{.Swarm.LocalNodeState}} / manager={{.Swarm.ControlAvailable}}'
sudo docker build -t casa-panel:local -f Dockerfile .
sudo docker build -t alexa-shopping-reader:local -f alexa-shopping-reader/Dockerfile alexa-shopping-reader
```

Un SHA fija el código fuente, **no garantiza imágenes idénticas bit a bit**: las etiquetas de imágenes base son mutables y las descargas de paquetes/dependencias pueden cambiar. Para una reversión exacta, conservar las imágenes construidas, sus digests/IDs y las versiones efectivas de paquetes y navegadores; no depender de reconstruir el mismo SHA.

Esperado: Swarm `active / manager=true` y ambas construcciones correctas. El panel usa contexto raíz y Node 24. El Dockerfile del lector hace `COPY reader.py bridge_server.py ./`: **su contexto es `alexa-shopping-reader/`, no la raíz**. Su imagen Playwright y paquete Python usan `1.64.1`. No incluye los scripts de login del host. Las imágenes locales bastan solo porque hay un nodo; no se configura un registro ni despliegue multinodo aquí.

## 2. Preparar los scripts del host y el almacenamiento

Se copia el código del lector al directorio fijo que esperan `start-login.sh`, el watcher y el shebang absoluto de `reconnect.py`. El perfil vive fuera de ambos árboles de código. No copiar perfiles ni cookies al repositorio.

```bash
set -euo pipefail
cd /home/ubuntu/casa-panel
test ! -e /home/ubuntu/alexa-shopping-reader
mkdir -m 700 /home/ubuntu/alexa-shopping-reader
install -m 600 alexa-shopping-reader/{reader.py,login_browser.py} /home/ubuntu/alexa-shopping-reader/
install -m 700 alexa-shopping-reader/{start-login.sh,stop-login.sh,login-request-watcher.sh,reconnect.py} /home/ubuntu/alexa-shopping-reader/
install -m 600 alexa-shopping-reader/alexa-login-watcher.service /home/ubuntu/alexa-shopping-reader/
BASE=/home/ubuntu/.local/share/alexa-shopping-reader
test ! -e "$BASE"
install -d -m 700 "$BASE" "$BASE/profile" "$BASE/state"
touch "$BASE/login.lock"
chmod 600 "$BASE/login.lock"
python3 -m venv /home/ubuntu/alexa-shopping-reader/.venv
/home/ubuntu/alexa-shopping-reader/.venv/bin/python -m pip install 'playwright==1.64.1'
sudo /home/ubuntu/alexa-shopping-reader/.venv/bin/python -m playwright install-deps chromium
/home/ubuntu/alexa-shopping-reader/.venv/bin/python -m playwright install chromium
command -v Xvfb x11vnc ss flock
/home/ubuntu/alexa-shopping-reader/.venv/bin/python -m pip show playwright
```

`install-deps` instala dependencias del navegador en el host: revisar sus requisitos para tu Ubuntu. La descarga de Chromium se ejecuta **como ubuntu**, no con sudo; así el navegador queda en su caché de usuario. El contenedor tiene sus propios navegadores. No basta con construir la imagen para disponer de login en el host.

**Permisos:** el Dockerfile del lector declara `USER root`. Para evitar que cree cookies, locks y estados que luego no pueda utilizar el watcher `ubuntu`, esta ruta cambia explícitamente el usuario del servicio al UID:GID de `ubuntu` con `--user`. No usar `chmod 777`. Si se omite ese cambio, el primer login puede funcionar pero las reconexiones posteriores fallar por archivos propiedad de root. La ejecución de la imagen con ese UID también debe comprobarse en tu servidor (no se ha ensayado aquí).

## 3. Primer login: antes de arrancar el bridge

En una terminal SSH del servidor:

```bash
cd /home/ubuntu/alexa-shopping-reader
./start-login.sh
```

En otra terminal de **tu ordenador**, sustituye `SERVIDOR` por el nombre/IP de tu servidor:

```bash
ssh -N -L 5901:127.0.0.1:5901 ubuntu@SERVIDOR
```

Conecta el cliente VNC a `127.0.0.1:5901`. Introduce contraseña/MFA **solo en Amazon**, nunca en archivos, chat o variables de entorno. `x11vnc` usa `-localhost -nopw`: el túnel y la seguridad del host son imprescindibles, no abrir ese puerto al exterior. Comprueba en el servidor con `ss -ltn` que 5901 está limitado a loopback.

Espera a `LOGIN_BROWSER_AUTHENTICATED` y a que termine `start-login.sh` (cierra Chromium diez segundos después de detectar la lista). El detector requiere al menos un elemento `.item-title`; una lista vacía no confirma el login. El navegador cierra también tras 30 minutos, lo cual **no demuestra autenticación**. Si no se confirma, investigar antes de seguir; no arrancar otro Chromium con el mismo perfil.

Una vez que el proceso haya terminado:

```bash
cd /home/ubuntu/alexa-shopping-reader
./stop-login.sh
# Comprueba estado sin imprimir artículos ni mensajes de Amazon:
set -o pipefail
.venv/bin/python reader.py --read | .venv/bin/python -c 'import json,sys; r=json.load(sys.stdin); print("ok="+str(r.get("ok")), "status="+str(r.get("status"))); sys.exit(0 if r.get("ok") else 1)'
```

Esperado: `ok=True status=ok`, salida 0. `stop-login.sh` detiene Xvfb/x11vnc, **no es un cierre de Chromium**: si interrumpes el login manualmente, espera también a que su proceso Python/Chromium termine. Cierra el túnel SSH al terminar. No lanzar lecturas manuales concurrentes: `reader.py --read` no adquiere el lock compartido por sí mismo.

## 4. Red privada y credenciales

Los bloques siguientes se ejecutan en **la misma sesión Bash del servidor**, sin `set -x` ni grabación de terminal. No pegar secretos como argumentos. El token se genera localmente; la contraseña se introduce sin eco. El fichero temporal queda fuera del repositorio, protegido y se elimina al crear el panel o al salir de esa shell.

```bash
set -euo pipefail
umask 077
sudo docker network create --driver overlay --attachable casa-interna
CREDENTIALS=$(mktemp -d)
trap 'rm -f "$CREDENTIALS/panel.env" "$CREDENTIALS/token"; rmdir "$CREDENTIALS"' EXIT
python3 -c 'import secrets; print(secrets.token_hex(32))' > "$CREDENTIALS/token"
sudo docker secret create alexa_bridge_token "$CREDENTIALS/token"
IFS= read -r -p 'Usuario del panel: ' DASHBOARD_USER
IFS= read -r -s -p 'Contraseña única y larga del panel (mínimo 20 caracteres): ' DASHBOARD_PASSWORD
printf '\n'
if [[ "$DASHBOARD_USER$DASHBOARD_PASSWORD" == *$'\r'* ]]; then
  printf '%s\n' 'Error: las credenciales no admiten retornos de carro (CR).' >&2
  exit 1
fi
test -n "$DASHBOARD_USER"
test "${#DASHBOARD_PASSWORD}" -ge 20
{
  printf 'DASHBOARD_USER=%s\nDASHBOARD_PASSWORD=%s\n' "$DASHBOARD_USER" "$DASHBOARD_PASSWORD"
  printf 'ALEXA_BRIDGE_TOKEN=%s\n' "$(< "$CREDENTIALS/token")"
  printf '%s\n' 'ALEXA_BRIDGE_URL=http://alexa-shopping-reader:8765/' 'ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP=true'
} > "$CREDENTIALS/panel.env"
unset DASHBOARD_PASSWORD
```

`IFS= read -r` conserva literalmente los espacios iniciales/finales y las barras invertidas; `printf` los escribe sin recortarlos ni añadir comillas al valor. Este formato `--env-file` requiere valores de una sola línea: **no admite saltos de línea (LF) ni retornos de carro (CR)**. No pegar credenciales multilínea: `read` termina en el primer LF; el bloque rechaza CR con un mensaje genérico, sin mostrar la credencial. Introducir cada valor completo en una sola línea y conservarlo tal cual en el gestor de secretos.

Esperado: red y secreto creados. Los nombres deben estar libres en una instalación nueva. Guarda contraseña y token en un gestor de secretos antes de cerrar la sesión: puedes importar el fichero temporal con una herramienta local segura; **no imprimirlo ni enviarlo por chat**. Si no guardas el token, habrá que rotarlo coordinadamente en ambos servicios.

El lector admite `ALEXA_BRIDGE_TOKEN_FILE`; el panel **no** admite una variable `_FILE`, por eso recibe el mismo valor con `--env-file`. Los administradores de Docker pueden leer ese entorno desde la especificación del servicio: restringir acceso a Docker y a sus copias de seguridad. El secreto de Swarm no hace privado el entorno del panel. No usar un `.env` versionado.

La red overlay es privada en el sentido de no publicar puertos, no una garantía de cifrado entre nodos; esta guía usa un único nodo. Solo adjuntar a ella los servicios autorizados y el proxy. El hostname exacto `alexa-shopping-reader` es obligatorio para la excepción HTTP del panel; alias como `reader` no sirven.

## 5. Arrancar lector y watcher

```bash
sudo docker service create --name alexa-shopping-reader \
  --replicas 1 --init --user "$(id -u ubuntu):$(id -g ubuntu)" \
  --update-order stop-first --rollback-order stop-first \
  --network name=casa-interna,alias=alexa-shopping-reader \
  --mount type=bind,src=/home/ubuntu/.local/share/alexa-shopping-reader,dst=/data \
  --secret source=alexa_bridge_token,target=alexa_bridge_token \
  --env ALEXA_BRIDGE_TOKEN_FILE=/run/secrets/alexa_bridge_token \
  alexa-shopping-reader:local
sudo docker service inspect alexa-shopping-reader \
  --format 'Init={{.Spec.TaskTemplate.ContainerSpec.Init}} User={{.Spec.TaskTemplate.ContainerSpec.User}}'
sudo docker service ps alexa-shopping-reader
sudo install -m 644 /home/ubuntu/alexa-shopping-reader/alexa-login-watcher.service /etc/systemd/system/alexa-login-watcher.service
sudo systemctl daemon-reload
sudo systemctl enable --now alexa-login-watcher.service
systemctl is-active alexa-login-watcher.service
```

Esperado: una tarea en ejecución, `Init=true`, UID:GID de ubuntu y watcher `active`. No hay `--publish` para el lector. `init` está declarado desde la creación para recoger huérfanos de Chromium; recrear el servicio sin esa opción lo pierde. Mantener una réplica y actualización `stop-first`: dos navegadores no pueden compartir el perfil.

El montaje `/data` permite al bridge escribir `login-request`, `reconnect-request` y `reconnect-status`; `login.lock` serializa la lectura del bridge con los procesos iniciados por el watcher. El watcher examina solicitudes cada dos segundos, ejecuta scripts fijos (no comandos del cliente) y `reconnect.py` utiliza el venv de ruta absoluta. No borrar estos archivos mientras haya procesos activos ni crear solicitudes manuales como prueba.

## 6. Arrancar panel y conectar HTTPS

En la misma shell que conserva `CREDENTIALS`:

```bash
sudo docker service create --name casa-panel --replicas 1 \
  --network name=casa-interna,alias=casa-panel \
  --env-file "$CREDENTIALS/panel.env" casa-panel:local
# Eliminar solo los temporales creados arriba, no datos persistentes:
rm -f "$CREDENTIALS/panel.env" "$CREDENTIALS/token"
rmdir "$CREDENTIALS"
trap - EXIT
unset CREDENTIALS
sudo docker service ps casa-panel
```

En la configuración persistente de tu proxy Swarm, adjunta su servicio a la red externa **`casa-interna`** y define la ruta `https://casa.example.net` → **`http://casa-panel:3000`**, conservando el encabezado `Authorization` y sin caché para API. Usar el nombre real de tu dominio. No apuntar al puerto 3000 del host: esta ruta no lo publica. El mecanismo de adjuntar red y definir dominio depende del proxy ya instalado; es un prerrequisito, no una configuración que este repositorio suministre. No poner el bridge detrás de un dominio público.

Valores opcionales del panel (configurarlos mediante un fichero protegido como el anterior o en el gestor, nunca en Git):

| Variable | Uso |
| --- | --- |
| `GOOGLE_CALENDAR_ICS_URL` | Dirección **secreta** iCal de Google Calendar; ausente deja la fuente sin configurar. No hacer público el calendario. |
| `TZ` | `Europe/Andorra` por defecto en la imagen. |
| `WEATHER_CITY`, `WEATHER_LAT`, `WEATHER_LON` | Por defecto Andorra la Vella, `42.5063`, `1.5218`. |
| `NEWS_RSS_URLS` | RSS/Atom HTTPS separados por comas; sustituye las fuentes por defecto. |

La imagen ya define `NODE_ENV=production` y `PORT=3000`; no cambiarlos sin adaptar el proxy y el healthcheck. La producción rechaza credenciales vacías. El panel no necesita volumen; su caché está en memoria.

## 7. Verificar sin volcar datos privados

Desde el servidor, los siguientes comandos comprueban DNS y conectividad **desde el panel**, sin token en la línea de comandos ni contenido de la lista. Ejecutar cuando solo haya una tarea de panel estable:

```bash
PANEL_ID=$(sudo docker ps -q --filter label=com.docker.swarm.service.name=casa-panel)
test -n "$PANEL_ID"
sudo docker exec "$PANEL_ID" node -e 'fetch("http://127.0.0.1:3000/healthz").then(async r=>{console.log(r.status);process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))'
sudo docker exec "$PANEL_ID" node -e 'fetch(process.env.ALEXA_BRIDGE_URL).then(r=>{console.log(r.status);process.exit(r.status===401?0:1)}).catch(()=>process.exit(1))'
sudo docker exec "$PANEL_ID" node -e 'fetch(process.env.ALEXA_BRIDGE_URL,{headers:{Authorization:"Bearer "+process.env.ALEXA_BRIDGE_TOKEN},signal:AbortSignal.timeout(90000)}).then(r=>{console.log(r.status);process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))'
# En tu dominio real: solo imprimir códigos, sin autenticarse:
curl -sS -o /dev/null -w '%{http_code}\n' https://casa.example.net/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://casa.example.net/
```

Esperado, en orden: `200`, `401`, `200`, `200`, `401`. `/healthz` es público y solo comprueba el panel, no Amazon. Una prueba con token tarda lo que tarde Chromium; no ejecutarla durante login. El lector no define healthcheck en su Dockerfile.

- [ ] Abrir el dominio HTTPS y autenticar el panel: sin errores de certificado ni credenciales en URL.
- [ ] Verificar visualmente clima/noticias y, si se configuró, Calendar; no copiar respuestas de API o capturas privadas a incidencias.
- [ ] Verificar Alexa y la antigüedad de datos. El panel refresca cada 15 minutos mientras está visible; actualización manual tiene límite de 30 segundos por fuente.
- [ ] Probar «Reconectar Alexa»: la interfaz solicita **primero el login**, incluso sin un estado previo `login_required`, con `POST /api/alexa-login`; después envía `POST /api/alexa-reconnect/start` y consulta `GET /api/alexa-reconnect/status`. Son rutas públicas del panel protegidas por su autenticación. El servidor las traduce respectivamente a `POST /login/start`, `POST /reconnect/start` y `GET /reconnect/status` del bridge privado, usando el token compartido; no llamar a esas rutas internas desde el navegador. Si Amazon pide acceso, abrir el túnel VNC y completar el login. Cerrar navegador y VNC como en el primer login; si termina en `login_required`, volver a intentarlo tras autenticarse. Revisar watcher activo si la solicitud no avanza.
- [ ] Confirmar que ni 8765 ni 5901 ni 3000 están publicados al exterior. Un `EXPOSE` del Dockerfile no publica el puerto.

## Servidor existente, EasyPanel y actualizaciones

**No repetir los bloques de instalación nueva** en el VPS actual. Inventariar nombres de servicios, montajes, redes, usuario efectivo, secreto y `Init` sin imprimir `docker inspect` completo (puede contener credenciales). No borrar ni sustituir `/home/ubuntu/.local/share/alexa-shopping-reader` para solucionar fallos.

Esta guía elige Swarm manual para ambos servicios; no migra automáticamente aplicaciones administradas por EasyPanel. Si mantienes el panel en EasyPanel, su Dockerfile sigue usando contexto raíz y puerto interno 3000. Debes adjuntar **de forma persistente en la definición gestionada por EasyPanel** tanto panel como lector a la misma red, conservar el alias exacto `alexa-shopping-reader`, el secreto, el montaje y `init=true`. Una modificación manual con `docker service update` puede ser reemplazada por EasyPanel al redesplegar. Si tu versión no permite conservar esos ajustes, no mezcles esta receta con sus redes implícitas: resuelve primero esa configuración o elige la ruta manual completa.

Para actualizar la ruta manual: conservar SHA anterior, construir imágenes con etiquetas nuevas y actualizar cada servicio con su imagen nueva mediante `docker service update --image IMAGEN SERVICIO`. Actualizar también los scripts del host desde esa misma revisión, con watcher detenido y sin login/lecturas activos; conservar venv y **nunca** copiar un perfil encima del existente. No lanzar el bloque inicial que exige directorios vacíos. Si cambia Playwright, alinear paquete/Chromium del host con el Dockerfile antes de reutilizar el perfil.

Un reinicio del host o `docker service update --force alexa-shopping-reader` conserva la especificación y el bind mount, aunque interrumpe lecturas. Tras actualizar/recrear comprobar `Init=true`, UID:GID, una réplica, alias/red, montaje `/data`, secreto y watcher activo; también repetir las comprobaciones de salud. Swarm no reinicia por sí mismo tu navegador VNC manual. No usar `start-first` ni escalar el lector.

### Recuperar permisos de una instalación que usaba root

Solo tras detener el watcher, escalar el lector a cero y cerrar cualquier login/lectura manual, revisar propietarios del **directorio exacto** de datos. Si esos datos son efectivamente de esta instalación, un administrador puede reasignarlos con `sudo chown -R ubuntu:ubuntu /home/ubuntu/.local/share/alexa-shopping-reader` y restringir el directorio/perfil a 700. Cambiar entonces el usuario efectivo del servicio a UID:GID de ubuntu antes de volver a una réplica y arrancar el watcher. No hacer el cambio recursivo con navegadores activos, ni sobre `/home`, `/data` del host o rutas no verificadas. La guía no altera permisos automáticamente en servidores existentes.

### Copias y restauración

Respaldar, cifrado y con acceso restringido, el directorio de datos completo (perfil, estado y locks), revisión del código, configuración del proxy/servicios y credenciales en el gestor seguro. Para una copia consistente: detener watcher, escalar lector a cero, terminar login y detener VNC; copiar solo cuando no haya Chromium activo. Restaurar en servidor preparado con los mismos caminos y UID:GID, recuperar permisos privados y volver a activar lector/watcher. Una copia del perfil equivale a una credencial y Amazon puede exigir un nuevo login igualmente. No subir backups a Git ni compartirlos como diagnósticos. Las imágenes y el código no sustituyen una copia de la sesión.

## Diagnóstico rápido

| Síntoma | Qué revisar sin revelar datos |
| --- | --- |
| `busy` (503) | Login/reconexión mantiene `login.lock`; esperar al cierre. No borrar locks ni matar procesos indiscriminadamente. |
| `401` del bridge | Coincidencia entre secreto del lector y token del panel; URL correcta. No imprimir tokens para compararlos; rotarlos si se perdieron. |
| `login_required` | Solicitar login desde Casa, watcher activo, túnel VNC y login manual. No borrar el perfil como primer paso. |
| `unavailable`, `PermissionError`, solicitudes que no avanzan | Montaje `/data`, UID:GID, permisos de perfil/lock/estados, rutas fijas, ejecutables y venv. Revisar localmente el journal del watcher; no compartirlo sin depurar datos sensibles. |
| `selector_drift_or_empty` o `empty_page` | Lista vacía, cambios de Amazon o página no cargada; no se interpreta vacío como éxito. Requiere revisión, no recrear datos. |
| DNS/HTTP interno rechazado | Misma `casa-interna`, alias `alexa-shopping-reader`, URL exacta y `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP=true`. |
| Procesos zombis | Comprobar `Init=true`; en el contenedor, PID 1 debe ser `docker-init`. Si falta, `docker service update --init=true --detach=false alexa-shopping-reader` recrea la tarea; conservarlo en la definición. No reiniciar todo el VPS ni eliminar el perfil como solución. |

Cron, `scheduled_read.py` y Hermes son automatizaciones **opcionales y separadas**. No están instaladas por esta guía ni se necesitan para Casa. Cualquier lectura externa debe coordinarse con el lock/perfil; no añadir cron concurrente sin resolverlo.

## Referencias del repositorio

- [Panel y variables](../README.md)
- [Lector y contrato HTTP](../alexa-shopping-reader/README.md)
- [Dockerfile del panel](../Dockerfile) y [del lector](../alexa-shopping-reader/Dockerfile)
- [Bridge](../alexa-shopping-reader/bridge_server.py), [lector](../alexa-shopping-reader/reader.py), [login](../alexa-shopping-reader/start-login.sh) y [cierre VNC](../alexa-shopping-reader/stop-login.sh)
- [Watcher](../alexa-shopping-reader/login-request-watcher.sh), [unidad systemd](../alexa-shopping-reader/alexa-login-watcher.service) y [reconexión](../alexa-shopping-reader/reconnect.py)
