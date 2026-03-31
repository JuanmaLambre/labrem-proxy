# LabRem Proxy

Servidor proxy inverso con autenticación OAuth para [LabRem](https://laboratorios-remotos.fi.uba.ar). Actúa como intermediario entre el navegador del alumno y el servidor del laboratorio: valida el token del usuario contra la API de autenticación, verifica que tenga un turno activo, y redirige el tráfico al servidor de destino correspondiente.

---

## Prerrequisitos

- Node.js >= 16
- npm

---

## Instalación y ejecución local

```bash
# Generar el archivo targets.json
echo '{}' > src/targets.json

# Instalar dependencias
npm install

# Iniciar el servidor con hot-reload
npm run dev
```

El servidor queda disponible en `http://localhost:3456` por defecto.

Para cambiar el puerto u otras opciones, crear un archivo `.env` en la raíz del proyecto.

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

### Scripts de inicio y monitoreo

- **`scripts/start.sh`** — verifica el entorno (Node.js, `.env`, `targets.json`, certificados SSL, dependencias) e inicia el servidor en segundo plano. Registra el watchdog como cron job si no existe.
- **`scripts/watchdog.sh`** — ejecutado por cron cada 5 minutos; consulta `/health` y reinicia el servidor automáticamente si no responde.

Estos scripts están pensados para ser corridos en producción.

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

## Deploy

El servidor de producción no tiene acceso libre a internet, por lo que no es posible correr `npm install` directamente en él. El script `scripts/deploy.sh` resuelve esto construyendo el proyecto localmente para Linux x86_64 y transfiriéndolo al servidor.

```bash
bash scripts/deploy.sh
```

El script:

1. Instala las dependencias para la plataforma Linux x86_64.
2. Empaqueta el proyecto (archivos del repositorio + `node_modules`) en un archivo `.zip`.
3. Sube el archivo al servidor vía `scp`.

> Requiere estar conectado a la VPN y tener acceso SSH al servidor.

Una vez dentro del servidor se puede ejecutar el siguiente comando para unzippear

```bash
unzip -o labrem-proxy-*.zip -d labrem-proxy
```

---

## Tests

```bash
# Correr todos los tests
npm test

# Modo watch
npm run test:watch
```

### Debugging

**1. Correr un archivo de test específico**

```bash
npx jest tests/middlewares/authMiddleware.test.ts
```

**2. Salida detallada (verbose) y con logs visibles**

El config tiene `silent: true` que suprime los `console.log`. Para ver la salida completa:

```bash
npx jest --verbose --silent=false tests/middlewares/authMiddleware.test.ts
```

**3. Correr solo un test por nombre**

```bash
npx jest --testNamePattern="nombre del test"
```

**4. Debugger de Node (para usar breakpoints)**

```bash
node --inspect-brk ./node_modules/.bin/jest --runInBand tests/middlewares/authMiddleware.test.ts
```

Luego abrir `chrome://inspect` en Chrome y conectarse al proceso. El flag `--runInBand` es necesario para que los tests corran en el mismo proceso que el debugger. Al abrir la console de debug se frena automáticamente la ejecución, pero de todas maneras se puede poner un breakpoint en el código agregando la línea `debugger;`
