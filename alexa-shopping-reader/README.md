# Alexa Shopping Reader

Lector de solo lectura para la lista de compras de Alexa desde Ubuntu sin entorno gráfico.

## Seguridad

- No guarda contraseñas ni códigos MFA.
- Usa un perfil separado en `/home/ubuntu/.local/share/alexa-shopping-reader/profile`.
- El perfil no pertenece al repositorio y debe tratarse como material equivalente a una credencial.
- Esta herramienta no contiene operaciones para añadir, borrar, marcar ni comprar.
- No publicar el puerto del navegador ni el perfil.

## Estado

Playwright y Chromium están instalados. El lector está validado contra Amazon España y reutiliza el perfil persistente autenticado. `--read` devuelve JSON con `ok: true`, `status: "ok"`, `count` e `items` cuando la sesión es válida; si Amazon exige volver a iniciar sesión, devuelve un estado de login y no interpreta una página vacía como una lista correcta.

## Prueba

```bash
.venv/bin/python reader.py --read
```

La salida es JSON. Un resultado correcto tendrá `ok: true`, `status: "ok"`, `count` e `items`.

## Inicio de sesión

El inicio de sesión se hará posteriormente mediante un navegador interactivo controlado por un túnel SSH. La contraseña y el código de verificación los introduce Guille directamente en el navegador; nunca se envían por Telegram ni se escriben en variables de entorno.

Cuando estés en casa:

1. En el servidor ejecuta `./start-login.sh`.
2. Desde tu computadora abre un túnel SSH: `ssh -L 5901:127.0.0.1:5901 ubuntu@SERVIDOR`.
3. Conecta un cliente VNC a `127.0.0.1:5901`.
4. Completa el login de Amazon/Alexa dentro de esa ventana.
5. Cierra el proceso con `./stop-login.sh` cuando aparezca `LOGIN_BROWSER_AUTHENTICATED`.

El VNC escucha solo en localhost del servidor; no se publica a Internet. El perfil persistente queda en `/home/ubuntu/.local/share/alexa-shopping-reader/profile` con permisos restringidos.

## Adaptador HTTP para Casa

`bridge_server.py` expone únicamente `GET /` con el contrato que consume `casa-panel`. En producción corre como servicio privado Docker `alexa-shopping-reader` en `0.0.0.0:8765`, exige `ALEXA_BRIDGE_TOKEN` mediante archivo secreto y no registra la lista ni cabeceras. No se publica el puerto 8765 directamente en Internet.

Variables del adaptador:

```text
ALEXA_BRIDGE_HOST=0.0.0.0
ALEXA_BRIDGE_PORT=8765
ALEXA_BRIDGE_TOKEN_FILE=/run/secrets/alexa_bridge_token
```

En Casa se configura `ALEXA_BRIDGE_URL=http://alexa-shopping-reader:8765/`, el mismo token en `ALEXA_BRIDGE_TOKEN` y `ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP=true`. Casa permite HTTP únicamente para ese hostname exacto dentro de la red privada Docker; las fuentes externas siguen requiriendo HTTPS.

## Automatización

Los horarios previstos son 09:00 y 20:00 de Andorra:

- 07:00 UTC durante el horario de verano.
- 08:00 UTC durante el horario de invierno.
- 18:00 UTC durante el horario de verano.
- 19:00 UTC durante el horario de invierno.

El calendario debe usar la zona `Europe/Andorra` para que el cambio horario sea automático. El cron de Hermes ejecuta lecturas a las 09:00 y 20:00 de Andorra y Casa actualiza la tarjeta automáticamente cada 15 minutos mientras está abierta.
