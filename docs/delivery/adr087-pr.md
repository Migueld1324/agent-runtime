# Título

feat: implement ADR-087 increment 1 extensible input contracts

# Descripción del PR

Incorpora descriptores v2 con inputSchema para nuevas herramientas del adaptador confiable de transformación. Por ejemplo, una variante uppercase rechaza lowercase antes de solicitar aprobación o reclamar una invocación. Ajv 8.20.0 valida exclusivamente el perfil aprobado tool-input/1; el esquema estructural compartido se anuncia a proveedores y se aplica localmente.

Conserva la representación y hashes v1, los grants históricos, los límites de los adaptadores y el flujo durable ADR-085/086. V2 canonicaliza solo el descriptor, con dominio propio; requestHash conserva la identidad exacta de los argumentos. V2 limita input a 1.024 caracteres Unicode para garantizar 2.048 unidades UTF-16: ASCII de 1.025–2.048 sigue disponible en v1. No incluye migración administrativa ni Maintenance Backend.

Validación local aislada sobre aa7df87: typecheck PASS, suite completa 56/56 PASS, integraciones v1/v2/v3 secuenciales PASS. Nuevas pruebas cubren Unicode, perfil y argumentos adversariales, hashes históricos, canonicalización, ausencia de efectos, approvals/grants entre procesos y recuperación v2 sin repetir Executor. La suite existente conserva las pruebas de caídas reales y persistencia. Evidencia, entorno y límites: docs/delivery/adr087-increment-1-validation.md.

Riesgos y límites: no se ejecutó npm ci ni inferencia remota; dependencia fijada y auditada con cero avisos en instalación final. La validación no acredita aislamiento OS, pérdida de energía ni conformidad remota de proveedores. Requiere revisión técnica y arquitectónica antes del merge.
