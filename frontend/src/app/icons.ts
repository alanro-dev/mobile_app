import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  chevronBackOutline,
  ellipse,
  eyeOffOutline,
  eyeOutline,
  fingerPrintOutline,
  gridOutline,
  keyOutline,
  layersOutline,
  lockClosed,
  lockClosedOutline,
  logOutOutline,
  mailOutline,
  peopleOutline,
  personCircleOutline,
  personOutline,
  refreshOutline,
  sparklesOutline,
  square,
  statsChartOutline,
  trashOutline,
  warningOutline,
} from 'ionicons/icons';

// Ionic 9 standalone components no longer resolve <ion-icon name="..."> by
// fetching an SVG at runtime — every icon used anywhere in the app must be
// registered up front. Call this once, before bootstrap.
export function registerAppIcons(): void {
  addIcons({
    'alert-circle-outline': alertCircleOutline,
    'checkmark-circle-outline': checkmarkCircleOutline,
    'chevron-back-outline': chevronBackOutline,
    ellipse,
    'eye-off-outline': eyeOffOutline,
    'eye-outline': eyeOutline,
    'finger-print-outline': fingerPrintOutline,
    'grid-outline': gridOutline,
    'key-outline': keyOutline,
    'layers-outline': layersOutline,
    'lock-closed': lockClosed,
    'lock-closed-outline': lockClosedOutline,
    'log-out-outline': logOutOutline,
    'mail-outline': mailOutline,
    'people-outline': peopleOutline,
    'person-circle-outline': personCircleOutline,
    'person-outline': personOutline,
    'refresh-outline': refreshOutline,
    'sparkles-outline': sparklesOutline,
    square,
    'stats-chart-outline': statsChartOutline,
    'trash-outline': trashOutline,
    'warning-outline': warningOutline,
  });
}