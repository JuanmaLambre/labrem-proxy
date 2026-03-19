- [x] Si existe un turno para esa experiencia próximamente, redirigir a una página que rediriga a la experiencia ('/') a la hora del turno
- [ ] Si no hay turnos disponibles para esa experiencia, redirigir a un front bonito que lo comunique.
- [x] Hacer que targets.json se pueda actualizar dinámicamente sin matar el server
- [x] Implement a README
- [ ] Clean up env vars
- [ ] Configurar CI

TESTS:

- [x] Verificar que si la autenticación devuelve un 500 (no se puede autorizar) no se actualiza el cache y se puede volver a intentar (si en la proxima devuelve 200)
- [x] Nuevo flujo
