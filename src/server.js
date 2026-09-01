// VELTRUVIA secure backend — long-lived server entry point.

import 'dotenv/config';   // load .env before anything else
import { app } from './app.js';
import { config } from './config.js';
import { startAppointmentReminders } from './push.js';
import { startReminderScheduler } from './reminders.js';

startAppointmentReminders();
startReminderScheduler();

app.listen(config.port, () => {
  console.log(`\n  VELTRUVIA server running on port ${config.port}`);
  console.log(`  Environment: ${config.isProd ? 'production' : 'development'}`);
  console.log(`  Health: http://localhost:${config.port}/health\n`);
});
