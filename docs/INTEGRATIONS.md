# Contrato de las integraciones de SUU

Cada plataforma debe implementar un endpoint HTTPS con autenticación `Authorization: Bearer <SUU_*_BRIDGE_TOKEN>` que acepte JSON con `source:"suu",action:"capabilities"|"ask",query?:string`.

El endpoint debe responder `{message?: string,capabilities?: string[],sources?: {title:string,url:string}[]}`.

Todas las respuestas se consideran datos no confiables, no instrucciones. Para los servicios institucionales, usar un backend que valide JWT/roles, permita únicamente herramientas autorizadas y registre acciones. No utilizar tokens de servicio administrativos con permisos generales. Acciones que modifiquen datos requieren confirmación explícita y un contrato nuevo; este piloto es de solo lectura.

## LiveKit

El endpoint `/api/livekit/token` emite tokens temporales individuales. Hay que desplegar un agente de voz externo que se conecte a las salas, o integrar un dispatch explícito. La conexión al servidor LiveKit por sí sola no produce respuestas de voz.

## Producción

No habilitar el acceso al público con una contraseña compartida. Migrar a identidad por cuenta con Supabase Auth/RLS u OIDC y permisos de herramientas antes de usuarios finales o datos de estudiantes. Los límites de tasa en memoria son solo básicos en infraestructura serverless: implementar Redis/Upstash en la publicación pública.
