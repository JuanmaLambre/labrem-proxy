# LabRem Proxy

Servidor proxy inverso con autenticación OAuth para [LabRem](https://laboratorios-remotos.fi.uba.ar). Actúa como intermediario entre el navegador del alumno y el servidor del laboratorio: valida el token del usuario contra la API de autenticación, verifica que tenga un turno activo, y redirige el tráfico al servidor de destino correspondiente.

---

## Prerrequisitos

- Node.js >= 16
- npm

---

## Instalación y ejecución local

```bash
# Instalar dependencias
npm install

# Iniciar el servidor con hot-reload
npm run dev
```

El servidor queda disponible en `http://localhost:3456` por defecto.

Para cambiar el puerto u otras opciones, crear un archivo `.env` en la raíz del proyecto:

```env
PORT=3456
AUTHENTICATION_URL=https://laboratorios-remotos-test.fi.uba.ar
CACHE_TTL_SECONDS=300
```

---

## Ejecución en producción

```bash
npm install

npm start
```

`npm run build` genera dos artefactos:

- `dist/` — cliente React compilado (páginas estáticas servidas por el proxy)
- `dist-server/` — servidor compilado a JavaScript

> En producción el archivo `dist-server/src/targets.json` puede editarse en caliente sin reiniciar el servidor (ver [Configuración de targets](#configuración-de-targets)).

---

## Configuración de targets

El archivo `targets.json` define el mapeo entre el ID de experiencia y la URL del servidor de laboratorio:

```json
{
  "experience-id-1": "https://servidor-laboratorio-1.ejemplo.com",
  "experience-id-2": "https://servidor-laboratorio-2.ejemplo.com"
}
```

El servidor detecta cambios en este archivo automáticamente y recarga la configuración sin necesidad de reiniciarse.

---

## Tests

```bash
# Correr todos los tests
npm test

# Modo watch
npm run test:watch
```
