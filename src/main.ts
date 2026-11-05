import { Logger } from '@nestjs/common';
import { createApplication, startApplication } from './bootstrap';

void createApplication()
  .then(startApplication)
  .catch(() => {
    Logger.error(
      'No se pudo iniciar la API. Revisa la configuración.',
      'Bootstrap',
    );
    process.exitCode = 1;
  });
