# Autenticación e inferencia con cuenta ChatGPT

El adaptador del runtime usa Sign in with ChatGPT (SIWC) para inferencia mediante una cuenta autorizada, sin API key comercial. La coordinación permanece en Agent Runtime: el modelo propone una herramienta o respuesta final y no recibe callbacks de ejecución. Consultar [modelos](../specifications/models.md) para el protocolo y el routing implementados.

## Requisitos y alcance de la cuenta

El flujo SIWC está sujeto a la elegibilidad del cliente, consentimiento de uso del plan y autorización efectiva del servicio. Tener una suscripción ChatGPT Plus por sí sola no garantiza autorización de una aplicación privada. Los modelos y el uso dependen de las condiciones del plan, región y disponibilidad de la cuenta. Si el servicio deniega el acceso, detener el ensayo; no reutilizar cookies de sesión web ni sustituirlo silenciosamente por una API comercial.

El runtime admite una sola identidad ChatGPT local conectada. Un nuevo login debe coincidir con la identidad previamente validada; no es un sistema multiusuario general.

La inferencia remota transmite la tarea, descriptores de herramientas y observaciones registradas al proveedor seleccionado. Usar datos de demostración. Las pruebas offline no ejercitan login interactivo, catálogo remoto ni inferencia real; los ensayos reales anteriores están en [el cierre de la PoC](../delivery/poc-031-closure.md).

## Conectar y seleccionar modelo

Con el proyecto instalado según [la guía inicial](getting-started.md), ejecutar en un host con navegador:

```bash
npm run auth:v3 -- login
npm run auth:v3 -- status
npm run auth:v3 -- models
```

Seleccionar un slug exacto devuelto por el catálogo de la cuenta:

```bash
npm run auth:v3 -- use MODEL_SLUG
```

El CLI gestiona almacenamiento local, renovación de tokens, catálogo y modelo seleccionado. Los tokens se guardan fuera del repositorio, por defecto en `~/.config/agent-runtime-poc/chatgpt.json` en Linux, con permisos de archivo `0600`. Las rutas por plataforma y los overrides están en `src/v3/chatgpt-auth.ts`. No compartir ese archivo ni copiar credenciales o identidad personal a los registros de validación.

Para desconectar:

```bash
npm run auth:v3 -- logout
```

El logout elimina credenciales locales e intenta revocar el refresh token remoto. Si no puede confirmar la revocación, el CLI lo informa; eliminar el archivo local no demuestra revocación en el proveedor.

## Ejecutar una tarea real

Revisar `tools list` y registrar `text.transform` solo si falta, como indica [la guía inicial](getting-started.md). Elegir IDs y archivos nuevos; los ejemplos originales `account-1` y `cuenta-v3.md` pertenecen a evidencia histórica y pueden existir ya.

```bash
npm run agent:v3 -- start account-verified-1 --model chatgpt --task 'Convierte "prueba de IA" a mayúsculas y guarda el resultado en cuenta-verified-1.md' --expect-file cuenta-verified-1.md --expect-content 'PRUEBA DE IA'
npm run agent:v3 -- status account-verified-1
```

Cada `WAITING_APPROVAL` debe revisarse antes de autorizar. Si solicita la transformación esperada:

```bash
npm run agent:v3 -- approve account-verified-1
npm run agent:v3 -- status account-verified-1
```

Solo si la nueva propuesta es una escritura con ruta y contenido aceptables, aprobarla:

```bash
npm run agent:v3 -- approve account-verified-1
npm run agent:v3 -- status account-verified-1
cat workspace/cuenta-verified-1.md
```

El modelo real es no determinista: puede omitir una herramienta, responder antes de tiempo o emitir una propuesta inválida. Una respuesta final no basta para `COMPLETED`; el runtime debe verificar el objetivo declarado contra el archivo real. Un grant previo puede hacer que la transformación no pida aprobación otra vez, pero no autoriza la escritura. No conceder un permiso inesperado para forzar el resultado del ensayo.

Los escenarios de grants, revocación, denegación, routing y fallos tienen criterios y evidencia en [verificación](../delivery/verification.md) y [el cierre](../delivery/poc-031-closure.md). El límite de cinco propuestas y las restricciones de recuperación se describen en [la guía inicial](getting-started.md) y [runtime](../specifications/runtime.md).

## Referencias del adaptador

Estas son las referencias de SIWC utilizadas para la PoC. La autorización real y los modelos deben comprobarse mediante el flujo admitido por el servicio:

- [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).
- [Modelos e inferencia](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).
- [Limitaciones de la integración](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- [Perfiles y sesiones](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).
