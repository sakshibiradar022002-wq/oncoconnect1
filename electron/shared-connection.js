/**
 * Shared portal configuration for standalone Electron apps.
 * Each portal app (doctor / patient / lab) has its own unique config.
 */

import { join } from 'node:path';

// ══════════════════════════════════════════════════════════════════
//  Shared helpers
// ══════════════════════════════════════════════════════════════════

export function getPortalTitle(portal) {
  return { doctor: 'OncoConnect Doctor', patient: 'OncoConnect Patient', lab: 'OncoConnect Lab' }[portal] || 'OncoConnect';
}

export function getPortalIcon(portal, publicDir) {
  return join(publicDir, 'icons', portal === 'doctor' ? 'doctor-512.png' : 'patient-512.png');
}

export function getPortalConfig(portal) {
  return {
    doctor:  { portal: 'doctor',  title: 'OncoConnect Doctor',  subtitle: 'Doctor Software',   icon: '👨\u200d⚕️', themeColor: '#2563eb', portalPath: '/',          brand: 'SOFTWARE' },
    patient: { portal: 'patient', title: 'OncoConnect Patient', subtitle: 'Patient App',       icon: '📱', themeColor: '#059669', portalPath: '/patient.html', brand: 'APP' },
    lab:     { portal: 'lab',     title: 'OncoConnect Lab',     subtitle: 'Lab Portal',        icon: '🔬', themeColor: '#7c3aed', portalPath: '/lab.html',     brand: 'PORTAL' },
  }[portal];
}
